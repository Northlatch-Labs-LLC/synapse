import type { BillingPlanId, BillingPlanView } from "@synapse/shared/schemas"

/**
 * Billing configuration (PLAN-billing). Prices live in Stripe; this map fixes
 * the tier LIMITS (the product contract) and which Stripe price belongs to
 * which plan. Limits use -1 for unlimited.
 */

export interface BillingEnv {
  stripeApiKey?: string
  stripeWebhookSecret?: string
  stripePricePro?: string
  stripePriceTeam?: string
  appBaseUrl?: string
}

export function billingEnvFrom(processEnv: NodeJS.ProcessEnv): BillingEnv {
  return {
    stripeApiKey: processEnv.STRIPE_API_KEY || undefined,
    stripeWebhookSecret: processEnv.STRIPE_WEBHOOK_SECRET || undefined,
    stripePricePro: processEnv.STRIPE_PRICE_PRO || undefined,
    stripePriceTeam: processEnv.STRIPE_PRICE_TEAM || undefined,
    appBaseUrl: processEnv.APP_BASE_URL || undefined,
  }
}

export const BILLING_PLAN_LIMITS: Readonly<
  Record<BillingPlanId, BillingPlanView>
> = {
  free: {
    plan: "free",
    displayName: "Free",
    priceUsdCentsMonthly: 0,
    perSeat: false,
    maxActors: 3,
    maxMembers: 3,
    modelsTier: "auto",
  },
  pro: {
    plan: "pro",
    displayName: "Pro",
    priceUsdCentsMonthly: 2500,
    perSeat: false,
    maxActors: 10,
    maxMembers: 10,
    modelsTier: "all",
  },
  team: {
    plan: "team",
    displayName: "Team",
    priceUsdCentsMonthly: 2500,
    perSeat: true,
    maxActors: -1,
    maxMembers: -1,
    modelsTier: "all",
  },
}

export function isStripeConfigured(env: BillingEnv): boolean {
  return Boolean(env.stripeApiKey && env.stripePricePro && env.stripePriceTeam)
}

export function priceIdForPlan(
  env: BillingEnv,
  plan: "pro" | "team"
): string | undefined {
  return plan === "pro" ? env.stripePricePro : env.stripePriceTeam
}

export function planForPriceId(
  env: BillingEnv,
  priceId: string | null | undefined
): BillingPlanId | undefined {
  if (!priceId) return undefined
  if (priceId === env.stripePricePro) return "pro"
  if (priceId === env.stripePriceTeam) return "team"
  return undefined
}
