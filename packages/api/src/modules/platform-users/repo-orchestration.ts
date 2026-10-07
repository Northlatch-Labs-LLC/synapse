// platform-users/repo-orchestration.ts — default-db-bound entry points for the
// platform-users module. This is the module's ONE file (besides repo.ts) that
// may touch the db client: it opens the transaction each multi-step write
// needs and binds the list read to the default db, so controllers and tests
// never import the db client themselves. Mirrors soft-delete/repo-orchestration.

import { db, withDbTransaction } from "../../infrastructure/database/kysely.js"
import type { PlatformUserListParsedQuery } from "@synapse/shared/schemas"
import {
  listPlatformUsersPage as listPageOn,
  signOutPlatformUserEverywhereOn as signOutEverywhere,
  suspendPlatformUserOn as suspendUser,
  unsuspendPlatformUserOn as unsuspendUser,
} from "./service.js"

export function listPlatformUsersPage(query: PlatformUserListParsedQuery) {
  return listPageOn(query, db)
}

/** Suspend an account (one transaction: existence check + stamp + session revocation). */
export function suspendPlatformUser(userId: string): Promise<void> {
  return withDbTransaction((trx) => suspendUser(trx, userId))
}

/** Lift a suspension (one transaction). */
export function unsuspendPlatformUser(userId: string): Promise<void> {
  return withDbTransaction((trx) => unsuspendUser(trx, userId))
}

/** Sign-out-everywhere (one transaction: auth runtime + client-session closure). */
export function signOutPlatformUserEverywhere(userId: string): Promise<void> {
  return withDbTransaction((trx) => signOutEverywhere(trx, userId))
}
