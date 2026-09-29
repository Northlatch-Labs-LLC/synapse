import { z } from "zod"

/**
 * In-app billing contracts (PLAN-billing, FR-B1 2026-09-29).
 *
 * Tiers: free / pro (flat per workspace) / team (per seat). Limits use -1 for
 * "unlimited" so every consumer shares one integer comparison rule.
 */

export const BILLING_PLANS = ["free", "pro", "team"] as const
export const BILLING_PLAN_IDS = z.enum(BILLING_PLANS)
export type BillingPlanId = z.infer<typeof BILLING_PLAN_IDS>

export const BILLING_SUBSCRIPTION_STATUS_VALUES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "unpaid",
] as const
export const BILLING_SUBSCRIPTION_STATUSES = z.enum(
  BILLING_SUBSCRIPTION_STATUS_VALUES
)
export type BillingSubscriptionStatus = z.infer<
  typeof BILLING_SUBSCRIPTION_STATUSES
>

export const BILLING_PAID_PLAN_VALUES = ["pro", "team"] as const
export const BILLING_MODELS_TIER_VALUES = ["auto", "all"] as const
export const BILLING_LIMIT_KIND_VALUES = ["members", "actors"] as const

export const BillingPlanViewSchema = z.object({
  plan: BILLING_PLAN_IDS,
  displayName: z.string().min(1),
  /** Monthly price in whole USD cents; 0 for free. */
  priceUsdCentsMonthly: z.number().int().nonnegative(),
  /** Team is billed per seat; pro is per workspace. */
  perSeat: z.boolean(),
  /** -1 means unlimited. */
  maxActors: z.number().int().min(-1),
  maxMembers: z.number().int().min(-1),
  modelsTier: z.enum(BILLING_MODELS_TIER_VALUES),
})
export type BillingPlanView = z.infer<typeof BillingPlanViewSchema>

export const BillingPlansViewSchema = z.object({
  plans: z.array(BillingPlanViewSchema).min(1),
  currentPlan: BILLING_PLAN_IDS,
  /** False when Stripe env is not configured (self-host without billing). */
  stripeConfigured: z.boolean(),
})
export type BillingPlansView = z.infer<typeof BillingPlansViewSchema>

export const BillingUsageViewSchema = z.object({
  members: z.number().int().nonnegative(),
  actors: z.number().int().nonnegative(),
})
export type BillingUsageView = z.infer<typeof BillingUsageViewSchema>

export const BillingSubscriptionViewSchema = z.object({
  workspaceId: z.string().uuid(),
  plan: BILLING_PLAN_IDS,
  status: BILLING_SUBSCRIPTION_STATUSES,
  seatQuantity: z.number().int().positive(),
  /** ISO instant strings, null while on free (no Stripe period exists). */
  currentPeriodStart: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  usage: BillingUsageViewSchema,
})
export type BillingSubscriptionView = z.infer<
  typeof BillingSubscriptionViewSchema
>

/** POST /workspaces/:id/billing/checkout */
export const BillingCheckoutInputSchema = z.strictObject({
  plan: z.enum(BILLING_PAID_PLAN_VALUES),
  /** Seat count for team (min 3). Ignored for pro. */
  seats: z.number().int().min(3).max(500).optional(),
})
export type BillingCheckoutInput = z.infer<typeof BillingCheckoutInputSchema>

export const BillingCheckoutResultSchema = z.object({
  url: z.string().url(),
})

/** POST /workspaces/:id/billing/portal */
export const BillingPortalResultSchema = z.object({
  url: z.string().url(),
})

/** POST /billing/webhook — acknowledged synchronously; state changes are
 * applied from the verified event payload itself. */
export const BillingWebhookResultSchema = z.object({
  received: z.literal(true),
})

/** Error body for plan-limit rejections (HTTP 402). */
export const BillingLimitErrorSchema = z.object({
  error: z.string(),
  code: z.literal("plan_limit_reached"),
  limit: z.enum(["actors", "members"]),
  currentPlan: BILLING_PLAN_IDS,
})
export type BillingLimitError = z.infer<typeof BillingLimitErrorSchema>
