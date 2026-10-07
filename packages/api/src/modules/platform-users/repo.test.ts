import test from "node:test"
import assert from "node:assert/strict"
import { withTestDb } from "../../test/helpers/db.js"
import { PLATFORM_USER_STATUS_FILTER } from "@synapse/shared"
import type { PlatformUserListParsedQuery } from "@synapse/shared/schemas"
import {
  listPlatformUsers,
  selectPlatformUserById,
  signOutPlatformUserEverywhereOn,
  suspendPlatformUserOn,
  unsuspendPlatformUserOn,
} from "./repo.js"

type AnyDb = import("kysely").Kysely<any>

let _seq = 0
const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${_seq++}`

// Fixtures mirror the soft-delete regression suite (real testcontainer schema,
// every test inside the shared rolled-back transaction).

async function insertUser(
  db: AnyDb,
  opts: {
    email?: string
    name?: string
    createdAt?: Date
  } = {}
): Promise<string> {
  const row = await db
    .insertInto("users")
    .values({
      email: opts.email ?? `${uniq("u")}@example.test`,
      name: opts.name ?? "Test User",
      // Explicit timestamps: DEFAULT NOW() is the TRANSACTION timestamp, so
      // rows inserted inside one test transaction would tie and the
      // (created_at DESC, id DESC) ordering would fall to random UUIDs.
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    })
    .returning("id")
    .executeTakeFirstOrThrow()
  return row.id as string
}

async function insertWorkspace(db: AnyDb, ownerId: string): Promise<string> {
  const row = await db
    .insertInto("workspaces")
    .values({ ownerId, slug: uniq("ws"), name: "w" })
    .returning("id")
    .executeTakeFirstOrThrow()
  return row.id as string
}

async function insertMember(
  db: AnyDb,
  workspaceId: string,
  userId: string
): Promise<string> {
  const row = await db
    .insertInto("workspaceMembers")
    .values({ workspaceId, userId, trustLevel: "member" })
    .returning("id")
    .executeTakeFirstOrThrow()
  return row.id as string
}

async function insertConversation(
  db: AnyDb,
  workspaceId: string
): Promise<string> {
  const row = await db
    .insertInto("conversations")
    .values({ workspaceId, kind: "group", title: "conv" })
    .returning("id")
    .executeTakeFirstOrThrow()
  return row.id as string
}

async function insertActor(db: AnyDb, workspaceId: string): Promise<string> {
  const actorId = crypto.randomUUID()
  const subject = await db
    .insertInto("accessSubjects")
    .values({ kind: "workspace", workspaceId })
    .returning("id")
    .executeTakeFirstOrThrow()
  await db
    .insertInto("workspaceResources")
    .values({
      id: actorId,
      workspaceId,
      kind: "actor",
      displayName: "a",
      status: "active",
      createdBySubjectId: subject.id as string,
    } as any)
    .execute()
  const row = await db
    .insertInto("actors")
    .values({ id: actorId, role: "assistant", title: "t", currentVersion: 1 })
    .returning("id")
    .executeTakeFirstOrThrow()
  return row.id as string
}

async function insertSession(
  db: AnyDb,
  workspaceId: string,
  actorId: string,
  conversationId: string
): Promise<string> {
  const row = await db
    .insertInto("sessions")
    .values({ workspaceId, actorId, conversationId })
    .returning("id")
    .executeTakeFirstOrThrow()
  return row.id as string
}

async function insertTurn(
  db: AnyDb,
  sessionId: string,
  conversationId: string,
  actorId: string
): Promise<string> {
  const row = await db
    .insertInto("turns")
    .values({ sessionId, conversationId, actorId, triggerType: "user_message" })
    .returning("id")
    .executeTakeFirstOrThrow()
  return row.id as string
}

async function insertProviderStep(
  db: AnyDb,
  turnId: string,
  opts: {
    stepIndex?: number
    status?: "success" | "error" | "timeout"
    createdAt?: Date
  } = {}
): Promise<string> {
  const row = await db
    .insertInto("providerSteps")
    .values({
      turnId,
      stepIndex: opts.stepIndex ?? 0,
      providerType: "zai",
      requestType: "actor_think",
      modelName: "glm-5.3-flash",
      status: opts.status ?? "success",
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    })
    .returning("id")
    .executeTakeFirstOrThrow()
  return row.id as string
}

async function insertBaSession(db: AnyDb, userId: string): Promise<string> {
  const row = await db
    .insertInto("session")
    .values({
      userId,
      token: uniq("tok"),
      expiresAt: new Date(Date.now() + 60 * 60_000),
    })
    .returning("id")
    .executeTakeFirstOrThrow()
  return row.id as string
}

async function insertDeviceCode(db: AnyDb, userId: string): Promise<string> {
  const row = await db
    .insertInto("deviceCode")
    .values({
      userId,
      deviceCode: uniq("dc"),
      userCode: uniq("uc"),
      expiresAt: new Date(Date.now() + 10 * 60_000),
      status: "pending",
    })
    .returning("id")
    .executeTakeFirstOrThrow()
  return row.id as string
}

async function insertChatClientInstance(
  db: AnyDb,
  workspaceId: string,
  workspaceMemberId: string,
  status: "active" | "revoked" = "active"
): Promise<string> {
  const row = await db
    .insertInto("chatClientInstances")
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      workspaceMemberId,
      status,
    })
    .returning("id")
    .executeTakeFirstOrThrow()
  return row.id as string
}

// Full telemetry chain for one user: membership → conversation → session →
// turn → provider steps. Returns the ids the assertions need.
async function seedTelemetryChain(db: AnyDb, userId: string) {
  const workspaceId = await insertWorkspace(db, userId)
  await insertMember(db, workspaceId, userId)
  const conversationId = await insertConversation(db, workspaceId)
  const actorId = await insertActor(db, workspaceId)
  const sessionId = await insertSession(
    db,
    workspaceId,
    actorId,
    conversationId
  )
  const turnId = await insertTurn(db, sessionId, conversationId, actorId)
  return { workspaceId, conversationId, actorId, sessionId, turnId }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60_000)
}

async function countRows(
  db: AnyDb,
  table: string,
  where: Record<string, unknown>
): Promise<number> {
  let query = db
    .selectFrom(table as any)
    .select(({ fn }) => fn.countAll().as("c"))
  for (const [column, value] of Object.entries(where)) {
    query = query.where(column as any, "=", value) as any
  }
  const rows = await query.execute()
  return Number((rows[0] as any).c)
}

test(
  "listPlatformUsers returns users with aggregate subqueries and pagination",
  { timeout: 5 * 60_000 },
  async () => {
    await withTestDb(async (db) => {
      const alice = await insertUser(db, {
        email: "alice@example.test",
        name: "Alice",
        createdAt: new Date(Date.now() - 3 * 60_000),
      })
      const bob = await insertUser(db, {
        email: "bob@example.test",
        name: "Bob",
        createdAt: new Date(Date.now() - 2 * 60_000),
      })
      await insertUser(db, {
        email: "carol@example.test",
        name: "Carol",
        createdAt: new Date(Date.now() - 1 * 60_000),
      })

      // alice: two workspaces, one success + one error step inside the 7d
      // window → workspaceCount 2, agentRuns7d 2, lastSuccessAt = the success.
      const chainA = await seedTelemetryChain(db, alice)
      await insertMember(db, await insertWorkspace(db, alice), alice)
      await insertProviderStep(db, chainA.turnId, {
        stepIndex: 0,
        status: "success",
        createdAt: daysAgo(3),
      })
      await insertProviderStep(db, chainA.turnId, {
        stepIndex: 1,
        status: "error",
        createdAt: daysAgo(1),
      })

      // bob: one workspace, but the only step is 10 days old → runs 0, no
      // lastSuccessAt.
      const chainB = await seedTelemetryChain(db, bob)
      await insertProviderStep(db, chainB.turnId, {
        status: "success",
        createdAt: daysAgo(10),
      })

      const page = await listPlatformUsers(
        {
          page: 1,
          pageSize: 20,
          status: PLATFORM_USER_STATUS_FILTER.ACTIVE,
        } as PlatformUserListParsedQuery,
        db
      )

      assert.equal(page.total, 3)
      // Newest first: carol (1 min ago), bob (2), alice (3).
      assert.deepEqual(
        page.users.map((row) => row.email),
        ["carol@example.test", "bob@example.test", "alice@example.test"]
      )

      const aliceRow = page.users.find((row) => row.id === alice)
      assert.ok(aliceRow)
      assert.equal(aliceRow.email, "alice@example.test")
      assert.equal(aliceRow.emailVerified, false)
      assert.ok(aliceRow.createdAt instanceof Date)
      assert.equal(aliceRow.deletedAt, null)
      assert.equal(aliceRow.suspendedAt, null)
      assert.equal(aliceRow.workspaceCount, 2)
      assert.equal(aliceRow.agentRuns7d, 2)
      assert.ok(
        aliceRow.lastSuccessAt instanceof Date &&
          Math.abs(
            daysAgo(3).getTime() - new Date(aliceRow.lastSuccessAt).getTime()
          ) < 60_000,
        "lastSuccessAt is the 3-days-ago success step"
      )

      const bobRow = page.users.find((row) => row.id === bob)
      assert.ok(bobRow)
      assert.equal(bobRow.workspaceCount, 1)
      // The 7d window excludes bob's only step, but lastSuccessAt is the
      // all-time last successful step — so it still points at the 10-day-old
      // success.
      assert.equal(bobRow.agentRuns7d, 0)
      assert.ok(
        bobRow.lastSuccessAt instanceof Date &&
          Math.abs(
            daysAgo(10).getTime() - new Date(bobRow.lastSuccessAt).getTime()
          ) < 60_000,
        "lastSuccessAt is the all-time last success (10 days ago)"
      )
    })
  }
)

test(
  "listPlatformUsers searches email and name case-insensitively",
  { timeout: 5 * 60_000 },
  async () => {
    await withTestDb(async (db) => {
      const alice = await insertUser(db, {
        email: "alice@example.test",
        name: "Wonderland Alice",
      })
      await insertUser(db, { email: "bob@example.test", name: "Bob" })

      const byEmail = await listPlatformUsers(
        {
          page: 1,
          pageSize: 20,
          status: PLATFORM_USER_STATUS_FILTER.ALL,
          search: "ALICE@EXAMPLE",
        } as PlatformUserListParsedQuery,
        db
      )
      assert.deepEqual(
        byEmail.users.map((row) => row.id),
        [alice]
      )

      const byName = await listPlatformUsers(
        {
          page: 1,
          pageSize: 20,
          status: PLATFORM_USER_STATUS_FILTER.ALL,
          search: "wonderland",
        } as PlatformUserListParsedQuery,
        db
      )
      assert.deepEqual(
        byName.users.map((row) => row.id),
        [alice]
      )

      // LIKE wildcards in the term match literally.
      const literal = await listPlatformUsers(
        {
          page: 1,
          pageSize: 20,
          status: PLATFORM_USER_STATUS_FILTER.ALL,
          search: "100%_match",
        } as PlatformUserListParsedQuery,
        db
      )
      assert.equal(literal.users.length, 0)
    })
  }
)

test(
  "listPlatformUsers status filter separates active and closed accounts",
  { timeout: 5 * 60_000 },
  async () => {
    await withTestDb(async (db) => {
      const live = await insertUser(db, { email: "live@example.test" })
      const closed = await insertUser(db, { email: "closed@example.test" })
      await db
        .updateTable("users")
        .set({ deletedAt: daysAgo(1) })
        .where("id", "=", closed)
        .execute()

      const active = await listPlatformUsers(
        {
          page: 1,
          pageSize: 20,
          status: PLATFORM_USER_STATUS_FILTER.ACTIVE,
        } as PlatformUserListParsedQuery,
        db
      )
      assert.deepEqual(
        active.users.map((row) => row.id),
        [live]
      )

      const closedPage = await listPlatformUsers(
        {
          page: 1,
          pageSize: 20,
          status: PLATFORM_USER_STATUS_FILTER.CLOSED,
        } as PlatformUserListParsedQuery,
        db
      )
      assert.deepEqual(
        closedPage.users.map((row) => row.id),
        [closed]
      )
      assert.equal(closedPage.total, 1)

      const all = await listPlatformUsers(
        {
          page: 1,
          pageSize: 20,
          status: PLATFORM_USER_STATUS_FILTER.ALL,
        } as PlatformUserListParsedQuery,
        db
      )
      assert.equal(all.total, 2)
    })
  }
)

test(
  "listPlatformUsers paginates with stable ordering and totals",
  { timeout: 5 * 60_000 },
  async () => {
    await withTestDb(async (db) => {
      const ids: string[] = []
      for (let i = 0; i < 3; i++) {
        ids.push(
          await insertUser(db, {
            email: `pg${i}@example.test`,
            createdAt: new Date(Date.now() - (3 - i) * 60_000),
          })
        )
      }
      const first = await listPlatformUsers(
        {
          page: 1,
          pageSize: 2,
          status: PLATFORM_USER_STATUS_FILTER.ALL,
        } as PlatformUserListParsedQuery,
        db
      )
      const second = await listPlatformUsers(
        {
          page: 2,
          pageSize: 2,
          status: PLATFORM_USER_STATUS_FILTER.ALL,
        } as PlatformUserListParsedQuery,
        db
      )
      assert.equal(first.total, 3)
      assert.equal(second.total, 3)
      assert.deepEqual(
        first.users.map((row) => row.id),
        [ids[2], ids[1]]
      )
      assert.deepEqual(
        second.users.map((row) => row.id),
        [ids[0]]
      )
    })
  }
)

test(
  "suspendPlatformUserOn stamps suspended_at once (idempotent) and revokes Better Auth sessions",
  { timeout: 5 * 60_000 },
  async () => {
    await withTestDb(async (db) => {
      const userId = await insertUser(db)
      await insertBaSession(db, userId)
      await insertBaSession(db, userId)
      await insertDeviceCode(db, userId)

      const first = await suspendPlatformUserOn(db, userId)
      assert.equal(first, true)

      const row = await selectPlatformUserById(userId, db)
      assert.ok(row?.suspendedAt instanceof Date)

      assert.equal(await countRows(db, "session", { userId }), 0)
      assert.equal(await countRows(db, "deviceCode", { userId }), 0)

      // Second suspend is a no-op on the timestamp (first call wins).
      const second = await suspendPlatformUserOn(db, userId)
      assert.equal(second, false)
      const after = await selectPlatformUserById(userId, db)
      assert.equal(
        new Date(after!.suspendedAt as unknown as Date).getTime(),
        new Date(row!.suspendedAt as unknown as Date).getTime()
      )
    })
  }
)

test(
  "unsuspendPlatformUserOn clears suspended_at and is idempotent",
  { timeout: 5 * 60_000 },
  async () => {
    await withTestDb(async (db) => {
      const userId = await insertUser(db)
      await suspendPlatformUserOn(db, userId)

      const cleared = await unsuspendPlatformUserOn(db, userId)
      assert.equal(cleared, true)
      const row = await selectPlatformUserById(userId, db)
      assert.equal(row?.suspendedAt, null)

      const again = await unsuspendPlatformUserOn(db, userId)
      assert.equal(again, false)
    })
  }
)

test(
  "signOutPlatformUserEverywhereOn revokes the Better Auth runtime and closes Synapse client sessions",
  { timeout: 5 * 60_000 },
  async () => {
    await withTestDb(async (db) => {
      const userId = await insertUser(db)
      const workspaceId = await insertWorkspace(db, userId)
      const memberId = await insertMember(db, workspaceId, userId)
      await insertBaSession(db, userId)
      await insertDeviceCode(db, userId)
      const activeInstance = await insertChatClientInstance(
        db,
        workspaceId,
        memberId,
        "active"
      )
      const alreadyRevoked = await insertChatClientInstance(
        db,
        workspaceId,
        memberId,
        "revoked"
      )

      await signOutPlatformUserEverywhereOn(db, userId)

      assert.equal(await countRows(db, "session", { userId }), 0)
      assert.equal(await countRows(db, "deviceCode", { userId }), 0)

      const instances = await db
        .selectFrom("chatClientInstances")
        .select(["id", "status"])
        .execute()
      const statuses = new Map(
        instances.map((row) => [row.id as string, row.status as string])
      )
      assert.equal(statuses.get(activeInstance), "revoked")
      assert.equal(statuses.get(alreadyRevoked), "revoked")

      // The user row itself is untouched — sign-out is NOT a soft delete.
      const row = await selectPlatformUserById(userId, db)
      assert.ok(row)
      assert.equal(row!.deletedAt, null)
      assert.equal(row!.suspendedAt, null)
    })
  }
)

test(
  "selectPlatformUserById returns null for unknown users",
  { timeout: 5 * 60_000 },
  async () => {
    await withTestDb(async (db) => {
      const missing = await selectPlatformUserById(crypto.randomUUID(), db)
      assert.equal(missing, null)
    })
  }
)
