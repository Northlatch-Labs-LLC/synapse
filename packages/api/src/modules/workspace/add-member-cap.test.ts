import { test } from "node:test"
import assert from "node:assert/strict"
import type {
  DatabaseTransaction,
  KyselyDb,
} from "../../infrastructure/database/kysely.js"
import { createDb } from "../../infrastructure/database/kysely.js"
import { withTestDb, getSharedTestDb } from "../../test/helpers/db.js"
import { addMemberInTransaction } from "./repo.js"
import { countActiveMembersOn } from "../billing/repo.js"
import { PlanLimitReachedError } from "../billing/service.js"
import type {
  BillingPlanId,
  BillingSubscriptionStatus,
} from "@synapse/shared/schemas"

/**
 * Member-cap enforcement at DIRECT member add (POST
 * /workspaces/:workspaceId/members → addMember → addMemberInTransaction).
 *
 * The redemption path has always enforced the seat cap inside its
 * transaction (invite/repo.ts); these tests pin that the direct-add path
 * enforces the SAME invariant: under cap the add succeeds, at cap it throws
 * PlanLimitReachedError and adds no member, an already-active member still
 * gets the 409 path (null) rather than a cap rejection, a revival of a
 * removed member re-consumes a seat, and — the serialization half — a
 * concurrent add on a second connection BLOCKS on the workspace row
 * FOR UPDATE lock until the first transaction ends.
 */

function rid() {
  return Math.random().toString(36).slice(2, 10)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface Seed {
  workspaceId: string
  targetUserId: string
}

async function seedDirectAddFixture(
  trx: KyselyDb,
  opts: {
    activeMembers: number
    subscription?: {
      plan: BillingPlanId
      status: BillingSubscriptionStatus
      seatQuantity: number
    }
    /** Pre-existing membership row for the target user (not counted as active
     * unless "active"; "removed"/"left" make directAdd take the revive branch). */
    targetExistingStatus?: "active" | "removed" | "left"
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
      .values({ ownerId: owner, slug: `ws-${rid()}`, name: "Add Cap Test WS" })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id as string

  await trx
    .insertInto("workspaceMembers")
    .values({ workspaceId, userId: owner, trustLevel: "admin" })
    .execute()

  // owner already counts as one active member; if the target is seeded as
  // active it is the LAST of the activeMembers (so the workspace really sits
  // at opts.activeMembers).
  const activeToSeed =
    opts.activeMembers - (opts.targetExistingStatus === "active" ? 1 : 0)
  for (let i = 1; i < activeToSeed; i++) {
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

  const targetUserId = (
    await trx
      .insertInto("users")
      .values({ email: `target-${rid()}@e.test`, name: "Target" })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id as string

  if (opts.targetExistingStatus) {
    await trx
      .insertInto("workspaceMembers")
      .values({
        workspaceId,
        userId: targetUserId,
        trustLevel: "member",
        status: opts.targetExistingStatus,
      })
      .execute()
  }

  return { workspaceId, targetUserId }
}

function directAdd(trx: KyselyDb, seed: Seed) {
  return addMemberInTransaction(trx as unknown as DatabaseTransaction, {
    workspaceId: seed.workspaceId,
    userId: seed.targetUserId,
    trustLevel: "member",
  })
}

test(
  "direct add under the cap succeeds and activates the membership",
  { timeout: 120_000 },
  async () => {
    const result = await withTestDb(async (trx) => {
      const seed = await seedDirectAddFixture(trx, { activeMembers: 2 })
      const added = await directAdd(trx, seed)
      const memberRow = await trx
        .selectFrom("workspaceMembers")
        .select(["status"])
        .where("workspaceId", "=", seed.workspaceId)
        .where("userId", "=", seed.targetUserId)
        .executeTakeFirst()
      return { seed, added, memberRow }
    })

    assert.ok(result.added)
    assert.equal(result.added.member.status, "active")
    assert.equal(result.memberRow?.status, "active")
  }
)

test(
  "direct add at the free-plan cap fails with PlanLimitReachedError and adds no member",
  { timeout: 120_000 },
  async () => {
    const outcome = await withTestDb(async (trx) => {
      const seed = await seedDirectAddFixture(trx, { activeMembers: 3 })
      let thrown: unknown
      try {
        await directAdd(trx, seed)
      } catch (err) {
        thrown = err
      }
      if (!thrown) return { kind: "no-throw" as const }
      // Same transaction: the target must NOT have become a member and the
      // active count must still be 3.
      const targetRow = await trx
        .selectFrom("workspaceMembers")
        .select(["id", "status"])
        .where("workspaceId", "=", seed.workspaceId)
        .where("userId", "=", seed.targetUserId)
        .executeTakeFirst()
      const activeMembers = await countActiveMembersOn(
        trx as unknown as DatabaseTransaction,
        seed.workspaceId
      )
      return { kind: "thrown" as const, thrown, targetRow, activeMembers }
    })

    assert.equal(outcome.kind, "thrown")
    if (outcome.kind !== "thrown") return
    assert.ok(outcome.thrown instanceof PlanLimitReachedError)
    assert.equal(outcome.thrown.limit, "members")
    assert.equal(outcome.thrown.currentPlan, "free")
    assert.equal(outcome.thrown.current, 3)
    assert.equal(outcome.thrown.max, 3)
    assert.equal(outcome.targetRow, undefined)
    assert.equal(outcome.activeMembers, 3)
  }
)

test(
  "direct add on team at the purchased seat count fails; below it succeeds",
  { timeout: 120_000 },
  async () => {
    // At cap: team subscription with 2 purchased seats, 2 active members.
    const atCap = await withTestDb(async (trx) => {
      const seed = await seedDirectAddFixture(trx, {
        activeMembers: 2,
        subscription: { plan: "team", status: "active", seatQuantity: 2 },
      })
      try {
        await directAdd(trx, seed)
        return undefined
      } catch (err) {
        return err
      }
    })
    assert.ok(atCap instanceof PlanLimitReachedError)
    assert.equal(atCap.currentPlan, "team")
    assert.equal(atCap.current, 2)
    assert.equal(atCap.max, 2)

    // Under cap: 3 purchased seats, 2 active members → third seat addable.
    const underCap = await withTestDb(async (trx) => {
      const seed = await seedDirectAddFixture(trx, {
        activeMembers: 2,
        subscription: { plan: "team", status: "active", seatQuantity: 3 },
      })
      return directAdd(trx, seed)
    })
    assert.ok(underCap)
    assert.equal(underCap.member.status, "active")
  }
)

test(
  "direct add of an already-active member still returns null (the 409 path) even at the cap",
  { timeout: 120_000 },
  async () => {
    const outcome = await withTestDb(async (trx) => {
      // The target is one of the 3 active members (free cap) — the
      // already-member check must win (409/null), not the cap rejection.
      const seed = await seedDirectAddFixture(trx, {
        activeMembers: 3,
        targetExistingStatus: "active",
      })
      try {
        return { kind: "returned" as const, result: await directAdd(trx, seed) }
      } catch (err) {
        return { kind: "thrown" as const, err }
      }
    })
    assert.equal(outcome.kind, "returned")
    if (outcome.kind !== "returned") return
    assert.equal(outcome.result, null)
  }
)

test(
  "reviving a removed member at the cap is capped (a revival re-consumes a seat)",
  { timeout: 120_000 },
  async () => {
    const outcome = await withTestDb(async (trx) => {
      // 3 active members (free cap) + a REMOVED row for the target: reviving
      // it would be a 4th seat, so the gate must reject and the row must stay
      // removed.
      const seed = await seedDirectAddFixture(trx, {
        activeMembers: 3,
        targetExistingStatus: "removed",
      })
      try {
        await directAdd(trx, seed)
        return { kind: "no-throw" as const }
      } catch (err) {
        const targetRow = await trx
          .selectFrom("workspaceMembers")
          .select(["status"])
          .where("workspaceId", "=", seed.workspaceId)
          .where("userId", "=", seed.targetUserId)
          .executeTakeFirst()
        const activeMembers = await countActiveMembersOn(
          trx as unknown as DatabaseTransaction,
          seed.workspaceId
        )
        return { kind: "thrown" as const, err, targetRow, activeMembers }
      }
    })

    assert.equal(outcome.kind, "thrown")
    if (outcome.kind !== "thrown") return
    assert.ok(outcome.err instanceof PlanLimitReachedError)
    assert.equal(outcome.err.currentPlan, "free")
    assert.equal(outcome.err.current, 3)
    assert.equal(outcome.err.max, 3)
    assert.equal(outcome.targetRow?.status, "removed")
    assert.equal(outcome.activeMembers, 3)
  }
)

test(
  "a concurrent direct add on a second connection blocks on the workspace row lock",
  { timeout: 120_000 },
  async () => {
    // Real two-connection serialization check against the shared container.
    // The fixture (workspace + 2 active members + two spare users) is
    // COMMITTED on a dedicated client: connection B must be able to SEE the
    // workspace row for its FOR UPDATE to contend with A's lock (an
    // uncommitted withTestDb-seeded row is invisible to B, whose lock then
    // matches nothing — in production the workspace row is always committed).
    const shared = await getSharedTestDb()
    const poolDb = createDb(shared.pool)
    const seed = await seedCommittedDirectAddFixture(shared.pool)

    // B's outcome is captured in an OUTER variable and awaited only AFTER
    // withTestDb returns: awaiting it inside the callback would self-deadlock
    // (B waits for A's lock, A's transaction only ends when the callback
    // returns). Returning the callback while B is still pending is what lets
    // the rollback release the lock and B complete.
    let bSettled = false
    let b: Promise<{ ok: true } | { ok: false; err: unknown }> | undefined

    await withTestDb(async (trx) => {
      // A: an under-cap add inside THIS transaction. Its locks (the
      // workspace row included) are held until withTestDb rolls back.
      const added = await addMemberInTransaction(
        trx as unknown as DatabaseTransaction,
        {
          workspaceId: seed.workspaceId,
          userId: seed.userAId,
          trustLevel: "member",
        }
      )
      assert.ok(added)

      // B: the same code path on a second connection. Must not complete
      // while A's transaction is open.
      b = poolDb
        .transaction()
        .execute(async (btrx) => {
          await addMemberInTransaction(btrx as unknown as DatabaseTransaction, {
            workspaceId: seed.workspaceId,
            userId: seed.userBId,
            trustLevel: "member",
          })
          bSettled = true
          // Roll B back too: this test asserts blocking, not committed state,
          // and a committed insert would leak past withTestDb's rollback.
          throw new TestRollback()
        })
        .then(
          () => ({ ok: true as const }),
          (err: unknown) =>
            err instanceof TestRollback
              ? { ok: true as const } // B's designed terminal state
              : { ok: false as const, err }
        )

      await sleep(500)
      assert.equal(
        bSettled,
        false,
        "concurrent direct add must block on the workspace FOR UPDATE lock"
      )
    })
    // withTestDb has now rolled A back → the lock released → B runs.
    assert.ok(b, "B must have been started inside the withTestDb callback")
    const bOutcome = await b
    if (!bOutcome.ok) {
      assert.fail(`concurrent add after A's rollback failed: ${bOutcome.err}`)
    }
  }
)

/**
 * COMMITTED fixture for the two-connection lock test: workspace with 2 active
 * members (free cap 3) plus two spare users for A's and B's adds. Runs on one
 * dedicated pool client so every row is visible to other connections.
 */
async function seedCommittedDirectAddFixture(
  pool: Awaited<ReturnType<typeof getSharedTestDb>>["pool"]
) {
  const client = await pool.connect()
  try {
    const reusableClient = new Proxy(client, {
      get(target, prop) {
        if (prop === "release") return () => {}
        const value = (target as any)[prop]
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    const db = createDb({
      connect: async () => reusableClient,
      end: async () => {},
    } as unknown as Parameters<typeof createDb>[0])

    const owner = (
      await db
        .insertInto("users")
        .values({ email: `owner-${rid()}@e.test`, name: "Owner" })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id as string
    const workspaceId = (
      await db
        .insertInto("workspaces")
        .values({ ownerId: owner, slug: `ws-${rid()}`, name: "Lock Test WS" })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id as string
    await db
      .insertInto("workspaceMembers")
      .values({ workspaceId, userId: owner, trustLevel: "admin" })
      .execute()

    const member = (
      await db
        .insertInto("users")
        .values({ email: `m-${rid()}@e.test`, name: "Member" })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id as string
    await db
      .insertInto("workspaceMembers")
      .values({ workspaceId, userId: member, trustLevel: "member" })
      .execute()

    const userAId = (
      await db
        .insertInto("users")
        .values({ email: `a-${rid()}@e.test`, name: "A" })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id as string
    const userBId = (
      await db
        .insertInto("users")
        .values({ email: `b-${rid()}@e.test`, name: "B" })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id as string

    return { workspaceId, userAId, userBId }
  } finally {
    client.release()
  }
}

class TestRollback extends Error {
  constructor() {
    super("test rollback")
    this.name = "TestRollback"
  }
}
