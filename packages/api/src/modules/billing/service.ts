import {
  BILLING_PLAN_LIMITS,
  billingEnvFrom,
  isStripeConfigured,
  planForPriceId,
  priceIdForPlan,
  type BillingEnv,
} from "./config.js"
import {
  createBillingPortalSession,
  createCheckoutSession,
  createCustomer,
  verifyStripeSignature,
} from "./stripe-client.js"
import {
  checkPlanLimit,
  countActiveMembersOn,
  ensureFreeSubscriptionRow,
  selectSubscription,
  selectSubscriptionOn,
  selectWorkspaceOwner,
  selectWorkspaceUsage,
  upsertSubscription,
} from "./repo.js"
import { createLogger } from "../../infrastructure/logger/index.js"
import type { Executor } from "../../infrastructure/database/kysely.js"
import { presentSubscription } from "./presenter.js"
import type {
  BillingPlanId,
  BillingPlansView,
  BillingSubscriptionStatus,
  BillingSubscriptionView,
} from "@synapse/shared/schemas"

const log = createLogger("billing")

/**
 * Billing orchestration: plan catalog, checkout/portal URL minting, and the
 * webhook state machine. The subscription row is created lazily; workspaces
 * without one are on free.
 */

export class BillingNotConfiguredError extends Error {
  constructor(message = "Billing is not configured on this deployment") {
    super(message)
    this.name = "BillingNotConfiguredError"
  }
}

export class PlanLimitReachedError extends Error {
  constructor(
    readonly limit: "members" | "actors",
    readonly currentPlan: BillingPlanId,
    readonly current: number,
    readonly max: number
  ) {
    super(
      `Plan limit reached: ${limit} — the ${currentPlan} plan allows ${max === -1 ? "unlimited" : max}. Upgrade in Settings → Billing.`
    )
    this.name = "PlanLimitReachedError"
  }
}

export class NotWorkspaceOwnerError extends Error {
  constructor() {
    super("Only the workspace owner can manage billing")
    this.name = "NotWorkspaceOwnerError"
  }
}

function env(): BillingEnv {
  return billingEnvFrom(process.env)
}

/** A subscription only grants its plan while active/trialing; anything else
 * (canceled, unpaid, past_due beyond grace) reads as free to the product. */
export async function getPlans(workspaceId: string): Promise<BillingPlansView> {
  const row = await getSubscription(workspaceId)
  return {
    plans: [
      BILLING_PLAN_LIMITS.free,
      BILLING_PLAN_LIMITS.pro,
      BILLING_PLAN_LIMITS.team,
    ],
    currentPlan: row.plan,
    stripeConfigured: isStripeConfigured(env()),
  }
}

export async function getSubscription(
  workspaceId: string
): Promise<BillingSubscriptionView> {
  await ensureFreeSubscriptionRow(workspaceId)
  const [row, usage] = await Promise.all([
    selectSubscription(workspaceId),
    selectWorkspaceUsage(workspaceId),
  ])
  const presented = presentSubscription(row, usage)
  return { ...presented, workspaceId }
}

async function requireOwner(workspaceId: string, userId: string) {
  const workspace = await selectWorkspaceOwner(workspaceId)
  if (!workspace || workspace.ownerId !== userId) {
    throw new NotWorkspaceOwnerError()
  }
  return workspace
}

export async function createCheckoutUrl(input: {
  workspaceId: string
  userId: string
  plan: "pro" | "team"
  seats?: number
}): Promise<string> {
  const cfg = env()
  const priceId = priceIdForPlan(cfg, input.plan)
  if (!isStripeConfigured(cfg) || !priceId) {
    throw new BillingNotConfiguredError()
  }
  const workspace = await requireOwner(input.workspaceId, input.userId)

  const existing = await selectSubscription(input.workspaceId)
  let customerId = existing?.stripeCustomerId ?? null
  if (!customerId) {
    const customer = await createCustomer(cfg.stripeApiKey!, {
      email: workspace.ownerEmail ?? undefined,
      workspaceId: input.workspaceId,
      workspaceName: workspace.name,
    })
    customerId = customer.id
  }

  const base = cfg.appBaseUrl ?? "https://synapse.xlaunch.work"
  const session = await createCheckoutSession(cfg.stripeApiKey!, {
    customerId,
    priceId,
    quantity: input.plan === "team" ? (input.seats ?? 3) : 1,
    successUrl: `${base}/dashboard/settings/billing?checkout=success`,
    cancelUrl: `${base}/dashboard/settings/billing?checkout=cancelled`,
    clientReferenceId: input.workspaceId,
    workspaceId: input.workspaceId,
  })
  log.info(
    { workspaceId: input.workspaceId, plan: input.plan },
    "checkout session created"
  )
  return session.url
}

export async function createPortalUrl(input: {
  workspaceId: string
  userId: string
}): Promise<string> {
  const cfg = env()
  if (!isStripeConfigured(cfg)) throw new BillingNotConfiguredError()
  await requireOwner(input.workspaceId, input.userId)
  const existing = await selectSubscription(input.workspaceId)
  if (!existing?.stripeCustomerId) {
    throw new BillingNotConfiguredError(
      "No billing profile yet — start a subscription first"
    )
  }
  const base = cfg.appBaseUrl ?? "https://synapse.xlaunch.work"
  const session = await createBillingPortalSession(
    cfg.stripeApiKey!,
    existing.stripeCustomerId,
    `${base}/dashboard/settings/billing`
  )
  return session.url
}

export interface StripeWebhookEvent {
  id?: string
  type?: string
  data?: { object?: Record<string, unknown> }
}

export async function handleWebhook(input: {
  rawBody: string
  signatureHeader: string | undefined
  event: StripeWebhookEvent
}): Promise<{ received: true }> {
  const cfg = env()
  if (!cfg.stripeWebhookSecret) {
    log.warn(
      "webhook received but STRIPE_WEBHOOK_SECRET is not set - ignoring event"
    )
    return { received: true }
  }
  if (
    !verifyStripeSignature({
      payload: input.rawBody,
      signatureHeader: input.signatureHeader,
      secret: cfg.stripeWebhookSecret,
    })
  ) {
    log.warn(
      { eventId: input.event.id },
      "webhook signature verification failed"
    )
    throw new Error("Invalid webhook signature")
  }

  const type = input.event.type
  const object = input.event.data?.object ?? {}
  log.info({ type, eventId: input.event.id }, "webhook processed")

  const metadata = (object.metadata as Record<string, string> | undefined) ?? {}

  if (type === "checkout.session.completed") {
    const workspaceId =
      metadata.workspaceId ?? (object.client_reference_id as string | undefined)
    const subscriptionId = object.subscription as string | undefined
    const customerId = object.customer as string | undefined
    if (!workspaceId || !subscriptionId) {
      log.warn(
        { eventId: input.event.id },
        "checkout completed without workspace reference"
      )
      return { received: true }
    }
    // Plan/period details arrive on the follow-up customer.subscription.updated
    // event; here we pin ids so that handler matches this subscription.
    const existing = await selectSubscription(workspaceId)
    await upsertSubscription({
      workspaceId,
      plan: existing?.plan ?? "free",
      status: existing?.status ?? "active",
      stripeCustomerId: customerId ?? existing?.stripeCustomerId ?? null,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: existing?.stripePriceId ?? null,
      seatQuantity: existing?.seatQuantity ?? 1,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    })
    return { received: true }
  }

  if (
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted"
  ) {
    const subscriptionId = object.id as string | undefined
    const workspaceId = metadata.workspaceId
    if (!workspaceId || !subscriptionId) {
      log.warn(
        { eventId: input.event.id },
        "subscription event without workspace metadata"
      )
      return { received: true }
    }
    const existing = await selectSubscription(workspaceId)
    if (
      existing?.stripeSubscriptionId &&
      existing.stripeSubscriptionId !== subscriptionId
    ) {
      return { received: true } // stale subscription — ignore
    }
    const deleted = type === "customer.subscription.deleted"
    const items =
      (object.items as { data?: Array<Record<string, unknown>> } | undefined)
        ?.data ?? []
    const item = (items[0] ?? {}) as {
      price?: { id?: string }
      quantity?: number
      current_period_start?: number
      current_period_end?: number
    }
    const status = (
      deleted ? "canceled" : String(object.status ?? "active")
    ) as BillingSubscriptionStatus
    const plan: BillingPlanId = deleted
      ? "free"
      : (planForPriceId(cfg, item.price?.id) ?? existing?.plan ?? "free")
    await upsertSubscription({
      workspaceId,
      plan:
        status === "active" || status === "trialing" || plan === "free"
          ? plan
          : "free",
      status,
      stripeCustomerId:
        (object.customer as string | undefined) ??
        existing?.stripeCustomerId ??
        null,
      stripeSubscriptionId: deleted ? null : subscriptionId,
      stripePriceId: deleted ? null : (item.price?.id ?? null),
      seatQuantity: Number(item.quantity ?? 1) || 1,
      currentPeriodStart: item.current_period_start
        ? new Date(item.current_period_start * 1000)
        : null,
      currentPeriodEnd: item.current_period_end
        ? new Date(item.current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
    })
    log.info({ workspaceId, plan, status }, "subscription synced")
  }

  return { received: true }
}

/** Shared gate for invite-create and actor-install: throws PlanLimitReachedError
 * when the workspace's current plan is at its cap. */
export async function enforcePlanLimit(
  workspaceId: string,
  limit: "members" | "actors"
): Promise<void> {
  const sub = await getSubscription(workspaceId)
  const violation = await checkPlanLimit(workspaceId, limit, {
    plan: sub.plan,
    maxActors: BILLING_PLAN_LIMITS[sub.plan].maxActors,
    maxMembers: BILLING_PLAN_LIMITS[sub.plan].maxMembers,
  })
  if (violation.exceeded) {
    throw new PlanLimitReachedError(
      limit,
      sub.plan,
      violation.current,
      violation.max
    )
  }
}

/**
 * Member cap derived from the workspace's subscription. Mirrors
 * presentSubscription's plan semantics (only active/trialing grants a paid
 * plan; anything else reads as free) and BILLING_PLAN_LIMITS for the caps:
 * free = 3 members, pro = 10. Team is per-seat ($25/seat/month) with a static
 * maxMembers of -1, so its real cap is the purchased seat_quantity on the
 * subscription row (synced from Stripe; absent row = free).
 */
export function deriveMemberCap(input: {
  plan: BillingPlanId
  status: BillingSubscriptionStatus
  seatQuantity: number | null
}): { plan: BillingPlanId; max: number } {
  const effectivePlan =
    input.plan !== "free" &&
    input.status !== "active" &&
    input.status !== "trialing"
      ? "free"
      : input.plan
  const limits = BILLING_PLAN_LIMITS[effectivePlan]
  const max =
    limits.perSeat && limits.maxMembers < 0
      ? Math.max(1, input.seatQuantity ?? 1)
      : limits.maxMembers
  return { plan: effectivePlan, max }
}

/**
 * Pure seat-cap gate for a membership add (invite redemption). Same comparison
 * rule as checkPlanLimit (`current >= max` rejects; max < 0 = unlimited) but
 * the team cap honors purchased seats. Throws PlanLimitReachedError — callers
 * map it to the standard 402 plan_limit_reached body.
 */
export function assertMemberCap(input: {
  plan: BillingPlanId
  status: BillingSubscriptionStatus
  seatQuantity: number | null
  activeMembers: number
}): void {
  const { plan, max } = deriveMemberCap(input)
  if (max >= 0 && input.activeMembers >= max) {
    throw new PlanLimitReachedError("members", plan, input.activeMembers, max)
  }
}

/**
 * Transaction-aware member-cap gate for invite redemption. Both the
 * subscription row and the active-member count are read on the caller's
 * executor (an open transaction), so an enforcement inside the redeem
 * transaction counts the same transactional state it is about to extend —
 * unlike enforcePlanLimit, which reads on the global db outside any tx.
 * An absent subscription row means free (same as ensureFreeSubscriptionRow's
 * lazy-insert semantics).
 */
export async function enforceMemberCapOn(
  executor: Executor,
  workspaceId: string
): Promise<void> {
  const sub = await selectSubscriptionOn(executor, workspaceId)
  const activeMembers = await countActiveMembersOn(executor, workspaceId)
  assertMemberCap({
    plan: sub?.plan ?? "free",
    status: sub?.status ?? "active",
    seatQuantity: sub?.seatQuantity ?? 1,
    activeMembers,
  })
}
