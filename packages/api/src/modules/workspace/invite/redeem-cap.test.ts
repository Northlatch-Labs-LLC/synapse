import { test } from "node:test"
import assert from "node:assert/strict"
import type {
  DatabaseTransaction,
  KyselyDb,
} from "../../../infrastructure/database/kysely.js"
import { withTestDb } from "../../../test/helpers/db.js"
import { redeemInviteInTransaction } from "./repo.js"
import { countActiveMembersOn } from "../../billing/repo.js"
import {
  PlanLimitReachedError,
  assertMemberCap,
  deriveMemberCap,
} from "../../billing/service.js"
import { BILLING_PLAN_LIMITS } from "../../billing/config.js"
import type {
  BillingPlanId,
  BillingSubscriptionStatus,
} from "@synapse/shared/schemas"

/**
 * Member-cap enforcement at invite redemption.
 *
 * Pure tests pin the cap derivation (plan limits from BILLING_PLAN_LIMITS,
 * team = purchased seat_quantity, non-active/trialing reads as free) and the
 * gate decision. DB-backed tests run the REAL transactional redeem path
 * (redeemInviteInTransaction) against the shared test container: under cap the
 * redeem succeeds, at cap it throws PlanLimitReachedError and adds no member.
 */

function rid() {
  return Math.random().toString(36).slice(2, 10)
}

// ── Cap derivation (pure) ──

test("deriveMemberCap uses the plan's static member limits for free and pro", () => {
  const free = deriveMemberCap({
    plan: "free",
    status: "active",
    seatQuantity: 1,
  })
  assert.deepEqual(free, {
    plan: "free",
    max: BILLING_PLAN_LIMITS.free.maxMembers,
  })
  assert.equal(free.max, 3)

  const pro = deriveMemberCap({
    plan: "pro",
    status: "active",
    seatQuantity: 1,
  })
  assert.deepEqual(pro, {
    plan: "pro",
    max: BILLING_PLAN_LIMITS.pro.maxMembers,
  })
  assert.equal(pro.max, 10)
})

test("deriveMemberCap caps team at the purchased seat quantity", () => {
  assert.deepEqual(
    deriveMemberCap({ plan: "team", status: "active", seatQuantity: 5 }),
    { plan: "team", max: 5 }
  )
  // null/absent seats never yield a sub-1 cap
  assert.equal(
    deriveMemberCap({ plan: "team", status: "trialing", seatQuantity: null })
      .max,
    1
  )
})

test("deriveMemberCap downgrades a non-active/trialing subscription to the free cap", () => {
  // Mirrors presentSubscription: only active/trialing grants the paid plan.
  for (const status of [
    "past_due",
    "canceled",
    "incomplete",
    "unpaid",
  ] as const) {
    assert.deepEqual(
      deriveMemberCap({ plan: "team", status, seatQuantity: 50 }),
      { plan: "free", max: BILLING_PLAN_LIMITS.free.maxMembers }
    )
  }
  assert.deepEqual(
    deriveMemberCap({ plan: "pro", status: "unpaid", seatQuantity: 1 }),
    { plan: "free", max: 3 }
  )
})

// ── Gate decision (pure) ──

test("assertMemberCap passes under the cap and rejects at the cap with PlanLimitReachedError", () => {
  const sub = {
    plan: "free" as BillingPlanId,
    status: "active" as BillingSubscriptionStatus,
    seatQuantity: 1,
  }
  // under cap: no throw
  assertMemberCap({ ...sub, activeMembers: 2 })

  // at cap: rejected with the 402-mappable error
  assert.throws(
    () => assertMemberCap({ ...sub, activeMembers: 3 }),
    (err: unknown) => {
      assert.ok(err instanceof PlanLimitReachedError)
      assert.equal(err.limit, "members")
      assert.equal(err.currentPlan, "free")
      assert.equal(err.current, 3)
      assert.equal(err.max, 3)
      return true
    }
  )
})

test("assertMemberCap rejects a team workspace at its purchased seat count", () => {
  const sub = {
    plan: "team" as BillingPlanId,
    status: "active" as BillingSubscriptionStatus,
    seatQuantity: 2,
  }
  assertMemberCap({ ...sub, activeMembers: 1 })
  assert.throws(
    () => assertMemberCap({ ...sub, activeMembers: 2 }),
    (err: unknown) => {
      assert.ok(err instanceof PlanLimitReachedError)
      assert.equal(err.limit, "members")
      assert.equal(err.currentPlan, "team")
      assert.equal(err.current, 2)
      assert.equal(err.max, 2)
      return true
    }
  )
})

// ── Full transactional redeem path (shared test container, rolled back) ──

interface Seed {
  workspaceId: string
  workspaceName: string
  token: string
  redeemerId: string
}

async function seedRedeemFixture(
  trx: KyselyDb,
  opts: {
    activeMembers: number
    subscription?: {
      plan: BillingPlanId
      status: BillingSubscriptionStatus
      seatQuantity: number
    }
  }
): Promise<Seed> {
  const owner = (
    await trx
      .insertInto("users")
      .values({ email: `owner-${rid()}@e.test`, name: "Owner" })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id as string
  const workspaceId = (
    await trx
      .insertInto("workspaces")
      .values({ ownerId: owner, slug: `ws-${rid()}`, name: "Cap Test WS" })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id as string

  const ownerMember = (
    await trx
      .insertInto("workspaceMembers")
      .values({ workspaceId, userId: owner, trustLevel: "admin" })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id as string

  // owner already counts as one active member
  for (let i = 1; i < opts.activeMembers; i++) {
    const u = (
      await trx
        .insertInto("users")
        .values({ email: `m${i}-${rid()}@e.test`, name: `Member ${i}` })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id as string
    await trx
      .insertInto("workspaceMembers")
      .values({ workspaceId, userId: u, trustLevel: "member" })
      .execute()
  }

  if (opts.subscription) {
    await trx
      .insertInto("workspaceSubscriptions")
      .values({
        workspaceId,
        plan: opts.subscription.plan,
        status: opts.subscription.status,
        seatQuantity: opts.subscription.seatQuantity,
      })
      .execute()
  }

  const redeemerId = (
    await trx
      .insertInto("users")
      .values({ email: `redeemer-${rid()}@e.test`, name: "Redeemer" })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id as string

  const token = `cap${rid()}`
  await trx
    .insertInto("workspaceInvites")
    .values({
      workspaceId,
      token,
      createdByWorkspaceMemberId: ownerMember,
      trustLevel: "member",
      maxUses: null,
      isRevoked: false,
    })
    .execute()

  return { workspaceId, workspaceName: "Cap Test WS", token, redeemerId }
}

test(
  "redeem under the cap succeeds and activates the membership",
  { timeout: 120_000 },
  async () => {
    const result = await withTestDb(async (trx) => {
      const seed = await seedRedeemFixture(trx, { activeMembers: 2 })
      const redeemed = await redeemInviteInTransaction(
        trx as unknown as DatabaseTransaction,
        seed.token,
        seed.redeemerId
      )
      const memberRow = await trx
        .selectFrom("workspaceMembers")
        .select(["status"])
        .where("workspaceId", "=", seed.workspaceId)
        .where("userId", "=", seed.redeemerId)
        .executeTakeFirst()
      const invite = await trx
        .selectFrom("workspaceInvites")
        .select(["useCount"])
        .where("token", "=", seed.token)
        .executeTakeFirst()
      return { seed, redeemed, memberRow, useCount: invite?.useCount }
    })

    assert.equal(result.redeemed.workspaceId, result.seed.workspaceId)
    assert.equal(result.redeemed.workspaceName, "Cap Test WS")
    assert.equal(result.redeemed.trustLevel, "member")
    assert.equal(result.memberRow?.status, "active")
    assert.equal(result.useCount, 1)
  }
)

test(
  "redeem at the free-plan cap fails with PlanLimitReachedError and adds no member",
  { timeout: 120_000 },
  async () => {
    const outcome = await withTestDb(async (trx) => {
      const seed = await seedRedeemFixture(trx, { activeMembers: 3 })
      let thrown: unknown
      try {
        await redeemInviteInTransaction(
          trx as unknown as DatabaseTransaction,
          seed.token,
          seed.redeemerId
        )
      } catch (err) {
        thrown = err
      }
      if (!thrown) return { kind: "no-throw" as const }
      // Same transaction: the redeemer must NOT have become a member, the
      // active count must still be 3, and the invite use count must be unbumped.
      const redeemerRow = await trx
        .selectFrom("workspaceMembers")
        .select(["id", "status"])
        .where("workspaceId", "=", seed.workspaceId)
        .where("userId", "=", seed.redeemerId)
        .executeTakeFirst()
      const activeMembers = await countActiveMembersOn(
        trx as unknown as DatabaseTransaction,
        seed.workspaceId
      )
      const invite = await trx
        .selectFrom("workspaceInvites")
        .select(["useCount"])
        .where("token", "=", seed.token)
        .executeTakeFirst()
      return {
        kind: "thrown" as const,
        thrown,
        redeemerRow,
        activeMembers,
        useCount: invite?.useCount,
      }
    })

    assert.equal(outcome.kind, "thrown")
    if (outcome.kind !== "thrown") return
    assert.ok(outcome.thrown instanceof PlanLimitReachedError)
    assert.equal(outcome.thrown.limit, "members")
    assert.equal(outcome.thrown.currentPlan, "free")
    assert.equal(outcome.thrown.current, 3)
    assert.equal(outcome.thrown.max, 3)
    assert.equal(outcome.redeemerRow, undefined)
    assert.equal(outcome.activeMembers, 3)
    assert.equal(outcome.useCount, 0)
  }
)

test(
  "redeem on team at the purchased seat count fails; below it succeeds",
  { timeout: 120_000 },
  async () => {
    // At cap: team subscription with 2 purchased seats, 2 active members.
    const atCap = await withTestDb(async (trx) => {
      const seed = await seedRedeemFixture(trx, {
        activeMembers: 2,
        subscription: { plan: "team", status: "active", seatQuantity: 2 },
      })
      try {
        await redeemInviteInTransaction(
          trx as unknown as DatabaseTransaction,
          seed.token,
          seed.redeemerId
        )
        return undefined
      } catch (err) {
        return err
      }
    })
    assert.ok(atCap instanceof PlanLimitReachedError)
    assert.equal(atCap.limit, "members")
    assert.equal(atCap.currentPlan, "team")
    assert.equal(atCap.current, 2)
    assert.equal(atCap.max, 2)

    // Under cap: 3 purchased seats, 2 active members → third seat redeemable.
    const underCap = await withTestDb(async (trx) => {
      const seed = await seedRedeemFixture(trx, {
        activeMembers: 2,
        subscription: { plan: "team", status: "active", seatQuantity: 3 },
      })
      return redeemInviteInTransaction(
        trx as unknown as DatabaseTransaction,
        seed.token,
        seed.redeemerId
      )
    })
    assert.equal(underCap.trustLevel, "member")
  }
)
