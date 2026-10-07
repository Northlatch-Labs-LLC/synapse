// platform-users/service.ts — use-case orchestration for the platform
// registered-users layer. No SQL here (repo owns it), no wire mapping
// (presenter owns it). Every entry point is a platform-admin action.
//
// Orchestration cores take an Executor explicitly (testable inside a
// rolled-back transaction); the default-db-bound transaction entry points the
// controller consumes live in repo-orchestration.ts — the same split the
// soft-delete module uses (repo-orchestration.ts is the only place that may
// import the db client).

import type { PlatformUserListParsedQuery } from "@synapse/shared/schemas"
import type { Executor } from "../../infrastructure/database/kysely.js"
import {
  listPlatformUsers,
  selectPlatformUserById,
  signOutPlatformUserEverywhereOn as signOutEverywhereInRepo,
  suspendPlatformUserOn as suspendUserInRepo,
  unsuspendPlatformUserOn as unsuspendUserInRepo,
  type PlatformUserRow,
} from "./repo.js"

export class PlatformUserNotFoundError extends Error {
  constructor() {
    super("User not found")
    this.name = "PlatformUserNotFoundError"
  }
}

export type PlatformUserPage = {
  users: PlatformUserRow[]
  page: number
  pageSize: number
  total: number
}

export async function listPlatformUsersPage(
  query: PlatformUserListParsedQuery,
  executor: Executor
): Promise<PlatformUserPage> {
  const { users, total } = await listPlatformUsers(query, executor)
  return {
    users,
    page: query.page,
    pageSize: query.pageSize,
    total,
  }
}

async function requireUserOn(
  executor: Executor,
  userId: string
): Promise<PlatformUserRow> {
  const row = await selectPlatformUserById(userId, executor)
  if (!row) {
    throw new PlatformUserNotFoundError()
  }
  return row
}

/**
 * Suspend an account on the caller's executor: verifies the user exists
 * (PlatformUserNotFoundError otherwise), stamps suspended_at (idempotent —
 * first call wins) and revokes the user's active Better Auth sessions so the
 * suspension takes effect immediately (the auth middleware additionally
 * rejects any subsequent request with 403 account_suspended).
 */
export async function suspendPlatformUserOn(
  executor: Executor,
  userId: string
): Promise<void> {
  await requireUserOn(executor, userId)
  await suspendUserInRepo(executor, userId)
}

/**
 * Lift a suspension on the caller's executor (idempotent). Sessions are not
 * restored — the user signs in again.
 */
export async function unsuspendPlatformUserOn(
  executor: Executor,
  userId: string
): Promise<void> {
  await requireUserOn(executor, userId)
  await unsuspendUserInRepo(executor, userId)
}

/**
 * Sign-out-everywhere on the caller's executor: revokes the user's Better
 * Auth sessions AND closes the user's Synapse client sessions (status flip —
 * soft-delete house rules). Independent of suspended_at.
 */
export async function signOutPlatformUserEverywhereOn(
  executor: Executor,
  userId: string
): Promise<void> {
  await requireUserOn(executor, userId)
  await signOutEverywhereInRepo(executor, userId)
}
