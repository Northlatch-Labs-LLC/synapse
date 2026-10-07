// platform-users/repo.ts — DB access for the platform registered-users layer.
//
// House rule: SQL lives only in repo.ts. All reads/writes here are platform-admin
// surfaces (gated upstream by the platform.manage guard in the controller).
//
// List performance contract (million-user scale): the page scan runs on `users`
// ALONE (created_at DESC index for the default browse, trgm GIN indexes for the
// ILIKE search) and pagination is LIMIT/OFFSET over that single table — the
// per-user aggregates (workspaceCount / agentRuns7d / lastSuccessAt) are scalar
// SUBQUERIES evaluated only for the rows actually returned, never a join folded
// into the paginated scan (which would explode rows and offset-scan the join).
// Each subquery hop is index-backed: workspace_members(user_id) →
// conversations(workspace_id) → turns(conversation_id) →
// provider_steps(turn_id).

import { sql } from "kysely"
import { db, type Executor } from "../../infrastructure/database/kysely.js"
import { revokeAuthRuntimeForUser } from "../soft-delete/orchestration.js"
import type { PlatformUserListParsedQuery } from "@synapse/shared/schemas"
import { PLATFORM_USER_STATUS_FILTER } from "@synapse/shared"

export type PlatformUserRow = {
  id: string
  email: string
  name: string
  emailVerified: boolean
  createdAt: Date
  deletedAt: Date | null
  suspendedAt: Date | null
  workspaceCount: number
  agentRuns7d: number
  lastSuccessAt: Date | null
}

// LIKE wildcards in the user-supplied search term must match literally.
function toLikePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

function statusPredicate(status: PlatformUserListParsedQuery["status"]) {
  switch (status) {
    case PLATFORM_USER_STATUS_FILTER.ACTIVE:
      return sql`u.deleted_at IS NULL`
    case PLATFORM_USER_STATUS_FILTER.CLOSED:
      return sql`u.deleted_at IS NOT NULL`
    case PLATFORM_USER_STATUS_FILTER.ALL:
      return sql`TRUE`
  }
}

function searchPredicate(search: string | undefined) {
  if (!search) return sql``
  const like = toLikePattern(search)
  return sql` AND (u.email ILIKE ${like} OR u.name ILIKE ${like})`
}

// Agent-run telemetry: provider_steps reached through the user's (durable)
// workspace memberships → conversations → turns. Membership rows are single
// durable identities (status flips on leave/removal), so "the user's
// workspaces" matches on membership, not on current member status.
const agentRunsJoin = sql`
  FROM provider_steps ps
  JOIN turns t ON t.id = ps.turn_id
  JOIN conversations c ON c.id = t.conversation_id
  JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
  WHERE wm.user_id = u.id`

export async function listPlatformUsers(
  query: PlatformUserListParsedQuery,
  executor: Executor = db
): Promise<{ users: PlatformUserRow[]; total: number }> {
  const offset = (query.page - 1) * query.pageSize

  const rowsResult = await sql`
    SELECT
      u.id,
      u.email,
      u.name,
      u.email_verified,
      u.created_at,
      u.deleted_at,
      u.suspended_at,
      (SELECT COUNT(*)::int
         FROM workspace_members wm
         WHERE wm.user_id = u.id AND wm.status = 'active') AS workspace_count,
      (SELECT COUNT(*)::int
         ${agentRunsJoin}
           AND ps.created_at >= NOW() - INTERVAL '7 days') AS agent_runs_7d,
      (SELECT MAX(ps.created_at)
         ${agentRunsJoin}
           AND ps.status = 'success') AS last_success_at
    FROM users u
    WHERE ${statusPredicate(query.status)}${searchPredicate(query.search)}
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT ${query.pageSize} OFFSET ${offset}
  `.execute(executor)

  const countResult = await sql<{ total: string }>`
    SELECT COUNT(*)::text AS total
    FROM users u
    WHERE ${statusPredicate(query.status)}${searchPredicate(query.search)}
  `.execute(executor)

  // Kysely's CamelCasePlugin camelCases the top-level result keys.
  return {
    users: rowsResult.rows as unknown as PlatformUserRow[],
    total: Number(countResult.rows[0]?.total ?? 0),
  }
}

export async function selectPlatformUserById(
  userId: string,
  executor: Executor = db
): Promise<PlatformUserRow | null> {
  const result = await sql`
    SELECT
      u.id,
      u.email,
      u.name,
      u.email_verified,
      u.created_at,
      u.deleted_at,
      u.suspended_at,
      0 AS workspace_count,
      0 AS agent_runs_7d,
      NULL AS last_success_at
    FROM users u
    WHERE u.id = ${userId}
  `.execute(executor)
  return (result.rows[0] as unknown as PlatformUserRow) ?? null
}

/**
 * Stamp suspended_at (first call wins — idempotent) and revoke the user's
 * Better Auth session + device_code rows on the caller's executor, so the
 * suspension takes effect immediately (the middleware also enforces it
 * request-by-request). `session`/`device_code` are ephemeral Better-Auth-owned
 * tables whose hard delete is whitelisted exactly for
 * revokeAuthRuntimeForUser (soft-delete-table-classification.yml). Returns
 * true when THIS call set suspended_at (false = already suspended).
 */
export async function suspendPlatformUserOn(
  executor: Executor,
  userId: string
): Promise<boolean> {
  const result = await sql`
    UPDATE users
    SET suspended_at = NOW()
    WHERE id = ${userId} AND suspended_at IS NULL
  `.execute(executor)
  await revokeAuthRuntimeForUser(executor, userId)
  return Number(result.numAffectedRows ?? 0) > 0
}

/**
 * Clear suspended_at (idempotent). Sessions are NOT restored — the user just
 * signs in again. Returns true when THIS call cleared a suspension.
 */
export async function unsuspendPlatformUserOn(
  executor: Executor,
  userId: string
): Promise<boolean> {
  const result = await sql`
    UPDATE users
    SET suspended_at = NULL
    WHERE id = ${userId} AND suspended_at IS NOT NULL
  `.execute(executor)
  return Number(result.numAffectedRows ?? 0) > 0
}

/**
 * Sign-out-everywhere on the caller's executor: revoke the Better Auth runtime
 * (session + device_code, hard delete — whitelisted) AND close the user's
 * Synapse client sessions (chat_client_instances status flip to 'revoked' —
 * never hard-deleted, the same closure pattern markUserDeleted uses;
 * soft-delete house rules).
 */
export async function signOutPlatformUserEverywhereOn(
  executor: Executor,
  userId: string
): Promise<void> {
  await revokeAuthRuntimeForUser(executor, userId)
  await sql`
    UPDATE chat_client_instances
    SET status = 'revoked'
    WHERE status = 'active'
      AND workspace_member_id IN (
        SELECT id FROM workspace_members WHERE user_id = ${userId}
      )
  `.execute(executor)
}
