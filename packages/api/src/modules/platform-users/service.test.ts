import test from "node:test"
import assert from "node:assert/strict"
import { withTestDb } from "../../test/helpers/db.js"
import { PLATFORM_USER_STATUS_FILTER } from "@synapse/shared"
import type { PlatformUserListParsedQuery } from "@synapse/shared/schemas"
import {
  PlatformUserNotFoundError,
  listPlatformUsersPage,
  signOutPlatformUserEverywhereOn,
  suspendPlatformUserOn,
  unsuspendPlatformUserOn,
} from "./service.js"

type AnyDb = import("kysely").Kysely<any>

let _seq = 0
const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${_seq++}`

async function insertUser(db: AnyDb, email?: string): Promise<string> {
  const row = await db
    .insertInto("users")
    .values({
      email: email ?? `${uniq("svc")}@example.test`,
      name: "Service Test User",
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

async function insertChatClientInstance(
  db: AnyDb,
  workspaceId: string,
  workspaceMemberId: string
): Promise<string> {
  const row = await db
    .insertInto("chatClientInstances")
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      workspaceMemberId,
      status: "active",
    })
    .returning("id")
    .executeTakeFirstOrThrow()
  return row.id as string
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
  "listPlatformUsersPage returns the pagination envelope",
  { timeout: 5 * 60_000 },
  async () => {
    await withTestDb(async (db) => {
      await insertUser(db, "svc-a@example.test")
      await insertUser(db, "svc-b@example.test")

      const page = await listPlatformUsersPage(
        {
          page: 2,
          pageSize: 1,
          status: PLATFORM_USER_STATUS_FILTER.ACTIVE,
        } as PlatformUserListParsedQuery,
        db
      )

      assert.equal(page.page, 2)
      assert.equal(page.pageSize, 1)
      assert.equal(page.total, 2)
      assert.equal(page.users.length, 1)
    })
  }
)

test(
  "suspendPlatformUserOn stamps suspended_at and revokes the user's sessions",
  { timeout: 5 * 60_000 },
  async () => {
    await withTestDb(async (db) => {
      const userId = await insertUser(db)
      await insertBaSession(db, userId)

      await suspendPlatformUserOn(db, userId)

      const row = await db
        .selectFrom("users")
        .select(["suspendedAt"])
        .where("id", "=", userId)
        .executeTakeFirstOrThrow()
      assert.ok(row.suspendedAt instanceof Date)
      assert.equal(await countRows(db, "session", { userId }), 0)
    })
  }
)

test(
  "unsuspendPlatformUserOn clears suspended_at for a suspended user",
  { timeout: 5 * 60_000 },
  async () => {
    await withTestDb(async (db) => {
      const userId = await insertUser(db)
      await suspendPlatformUserOn(db, userId)
      await unsuspendPlatformUserOn(db, userId)

      const row = await db
        .selectFrom("users")
        .select(["suspendedAt"])
        .where("id", "=", userId)
        .executeTakeFirstOrThrow()
      assert.equal(row.suspendedAt, null)
    })
  }
)

test(
  "signOutPlatformUserEverywhereOn closes Synapse client sessions without tombstoning the user",
  { timeout: 5 * 60_000 },
  async () => {
    await withTestDb(async (db) => {
      const userId = await insertUser(db)
      const workspaceId = await insertWorkspace(db, userId)
      const memberId = await insertMember(db, workspaceId, userId)
      await insertBaSession(db, userId)
      const instanceId = await insertChatClientInstance(
        db,
        workspaceId,
        memberId
      )

      await signOutPlatformUserEverywhereOn(db, userId)

      assert.equal(await countRows(db, "session", { userId }), 0)
      const instance = await db
        .selectFrom("chatClientInstances")
        .select(["status"])
        .where("id", "=", instanceId)
        .executeTakeFirstOrThrow()
      assert.equal(instance.status, "revoked")
      const user = await db
        .selectFrom("users")
        .select(["deletedAt", "suspendedAt"])
        .where("id", "=", userId)
        .executeTakeFirstOrThrow()
      assert.equal(user.deletedAt, null)
      assert.equal(user.suspendedAt, null)
    })
  }
)

test(
  "every platform-user action 404s (PlatformUserNotFoundError) for unknown users",
  { timeout: 5 * 60_000 },
  async () => {
    await withTestDb(async (db) => {
      const ghost = crypto.randomUUID()

      await assert.rejects(suspendPlatformUserOn(db, ghost), (err: unknown) => {
        assert.ok(err instanceof PlatformUserNotFoundError)
        assert.equal((err as Error).message, "User not found")
        return true
      })
      await assert.rejects(
        unsuspendPlatformUserOn(db, ghost),
        PlatformUserNotFoundError
      )
      await assert.rejects(
        signOutPlatformUserEverywhereOn(db, ghost),
        PlatformUserNotFoundError
      )
    })
  }
)
