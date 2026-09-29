/**
 * Plan catalog contract tests: the three tiers exist, limits use the -1 =
 * unlimited convention consistently, and price-id mapping is bijective for the
 * paid plans.
 */
import assert from "node:assert/strict"
import test from "node:test"
import {
  BILLING_PLAN_LIMITS,
  billingEnvFrom,
  isStripeConfigured,
  planForPriceId,
  priceIdForPlan,
} from "./config.js"

test("plan catalog exposes exactly free/pro/team with sane limits", () => {
  const plans = Object.keys(BILLING_PLAN_LIMITS).sort()
  assert.deepEqual(plans, ["free", "pro", "team"])
  assert.equal(BILLING_PLAN_LIMITS.free.priceUsdCentsMonthly, 0)
  assert.ok(BILLING_PLAN_LIMITS.pro.priceUsdCentsMonthly > 0)
  assert.ok(BILLING_PLAN_LIMITS.team.perSeat)
  assert.ok(!BILLING_PLAN_LIMITS.pro.perSeat)
  for (const plan of Object.values(BILLING_PLAN_LIMITS)) {
    assert.ok(plan.maxActors >= 1 || plan.maxActors === -1)
    assert.ok(plan.maxMembers >= 1 || plan.maxMembers === -1)
  }
  // Team is the unlimited tier.
  assert.equal(BILLING_PLAN_LIMITS.team.maxActors, -1)
  assert.equal(BILLING_PLAN_LIMITS.team.maxMembers, -1)
})

test("isStripeConfigured requires key plus both price ids", () => {
  assert.equal(isStripeConfigured(billingEnvFrom({})), false)
  assert.equal(
    isStripeConfigured(
      billingEnvFrom({
        STRIPE_API_KEY: "sk_test_x",
        STRIPE_PRICE_PRO: "price_pro",
        STRIPE_PRICE_TEAM: "price_team",
      })
    ),
    true
  )
  assert.equal(
    isStripeConfigured(
      billingEnvFrom({
        STRIPE_API_KEY: "sk_test_x",
        STRIPE_PRICE_PRO: "price_pro",
      })
    ),
    false
  )
})

test("price id mapping is bijective for paid plans", () => {
  const env = billingEnvFrom({
    STRIPE_PRICE_PRO: "price_pro",
    STRIPE_PRICE_TEAM: "price_team",
  })
  assert.equal(priceIdForPlan(env, "pro"), "price_pro")
  assert.equal(priceIdForPlan(env, "team"), "price_team")
  assert.equal(planForPriceId(env, "price_pro"), "pro")
  assert.equal(planForPriceId(env, "price_team"), "team")
  assert.equal(planForPriceId(env, "price_unknown"), undefined)
  assert.equal(planForPriceId(env, null), undefined)
})
