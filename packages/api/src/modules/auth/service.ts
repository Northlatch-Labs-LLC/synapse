import type { FastifyRequest } from "fastify"
import { Headers as UndiciHeaders } from "undici"
import { fromNodeHeaders } from "better-auth/node"
import type { User } from "@synapse/shared"
import {
  canUserAccessFileWorkspace,
  getFileAccessInfo,
} from "../files/service.js"
import { auth } from "./better-auth.js"
import { presentUser } from "./presenter.js"
import {
  selectUserById,
  updateUserProfileRow,
  selectUserSessionGuardState,
} from "./repo.js"

/**
 * Auth service — Better Auth edition.
 *
 * Better Auth owns the user/account/session lifecycle (sign-up, sign-in,
 * sign-out, session issue/revoke, OAuth, device flow); those routes are served
 * by the mounted BA handler. This module keeps only:
 *   - profile read/update (`getProfile`/`updateProfile`) backing the custom
 *     GET/PUT /api/v1/auth/me endpoints, and
 *   - the request/header/token authentication helpers the Fastify middleware
 *     and WebSocket layers call to resolve a session into `{ user, session }`.
 *
 * All three auth helpers funnel through `auth.api.getSession`, so the only
 * trusted source of truth is Better Auth's (signed) session cookie or bearer
 * token — business code never parses the cookie by name (its production name
 * carries a `__Secure-` prefix).
 */

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message)
    this.name = "AuthError"
  }
}

async function getUserById(userId: string) {
  return selectUserById(userId)
}

export async function getProfile(userId: string): Promise<User> {
  const row = await getUserById(userId)
  if (!row) {
    throw new AuthError("User not found", 404, "USER_NOT_FOUND")
  }
  return presentUser(row)
}

export async function updateProfile(
  userId: string,
  input: { name?: string; avatarFileId?: string | null }
): Promise<User> {
  const current = await getUserById(userId)
  if (!current) {
    throw new AuthError("User not found", 404, "USER_NOT_FOUND")
  }

  const nextName = input.name === undefined ? current.name : input.name.trim()
  const nextAvatarFileId =
    input.avatarFileId === undefined
      ? (current.avatarFileId ?? null)
      : input.avatarFileId

  if (nextAvatarFileId) {
    const fileInfo = await getFileAccessInfo(nextAvatarFileId)
    if (!fileInfo) {
      throw new AuthError("Avatar file not found", 400, "AVATAR_FILE_NOT_FOUND")
    }
    const canAccess = await canUserAccessFileWorkspace(
      fileInfo.workspaceId ?? null,
      userId
    )
    if (!canAccess) {
      throw new AuthError(
        "Avatar file is not accessible",
        403,
        "AVATAR_FILE_FORBIDDEN"
      )
    }
  }

  const row = await updateUserProfileRow(userId, {
    name: nextName,
    avatarFileId: nextAvatarFileId ?? null,
  })

  if (!row) {
    throw new AuthError("User not found", 404, "USER_NOT_FOUND")
  }
  return presentUser(row)
}

/**
 * The minimal authenticated-session shape the middleware + WS layers consume:
 * `{ user: { id, email }, session: { id } }`. Preserved verbatim from the legacy
 * service so its downstream consumers (request.user / client.sessionId) keep
 * working unchanged.
 */
export interface AuthenticatedRequestSession {
  user: { id: string; email: string }
  session: { id: string }
}

function toAuthenticated(
  result: {
    user: { id: string; email: string }
    session: { id: string }
  } | null
): AuthenticatedRequestSession | null {
  if (!result?.user?.id || !result.session?.id) return null
  return {
    user: { id: result.user.id, email: result.user.email },
    session: { id: result.session.id },
  }
}

/**
 * Resolution outcome of the session guard, consumed by the Fastify auth
 * middleware so a SUSPENDED user can be told apart from an unauthenticated
 * request (403 account_suspended vs 401 UNAUTHENTICATED). Non-middleware
 * consumers (WebSocket layers, log ingest) use the boolean-style helpers below,
 * which collapse suspension to "not authenticated" — the safest behavior for
 * channels with no error-reply path.
 */
export type AuthenticatedSessionResolution =
  | { kind: "authenticated"; session: AuthenticatedRequestSession }
  | { kind: "unauthenticated" }
  | { kind: "suspended" }

/**
 * Soft-delete + suspension guard. Better Auth's getSession/findUserById do NOT
 * filter users.deleted_at (and know nothing of users.suspended_at), so a session
 * minted before account closure (or via a residual device_code) — or an account
 * suspended by a platform admin (modules/platform-users) — could still resolve.
 * One extra indexed (primary-key) users lookup decides both, treating closed
 * users as unauthenticated and suspended users as a distinct outcome.
 */
async function guardResolvedSession(
  authed: AuthenticatedRequestSession | null
): Promise<AuthenticatedSessionResolution> {
  if (!authed) return { kind: "unauthenticated" }
  const guard = await selectUserSessionGuardState(authed.user.id)
  if (!guard || guard.deletedAt !== null) {
    return { kind: "unauthenticated" }
  }
  if (guard.suspendedAt !== null) {
    return { kind: "suspended" }
  }
  return { kind: "authenticated", session: authed }
}

function toAuthenticatedOrNull(
  resolution: AuthenticatedSessionResolution
): AuthenticatedRequestSession | null {
  return resolution.kind === "authenticated" ? resolution.session : null
}

/**
 * Resolve a session from a set of (Node) request headers — the cookie-only
 * path, with the full suspended/unauthenticated discrimination. Used by the
 * Fastify auth middleware, which owns the wire-level error replies.
 */
export async function resolveSessionFromHeaders(
  headers: NodeJS.Dict<string | string[]>
): Promise<AuthenticatedSessionResolution> {
  const result = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  })
  return guardResolvedSession(toAuthenticated(result))
}

/**
 * Cookie-path helper that collapses suspension to "not authenticated" (null).
 * Used by the WebSocket/ASR layers when the client relies on the signed session
 * cookie carried on the upgrade request (web / Expo web).
 */
export async function authenticateSessionFromHeaders(
  headers: NodeJS.Dict<string | string[]>
): Promise<AuthenticatedRequestSession | null> {
  return toAuthenticatedOrNull(await resolveSessionFromHeaders(headers))
}

/**
 * Resolve a session from a raw bearer token — the token path. Used by native
 * mobile clients that carry the Better Auth session token in an app-level WS
 * auth frame (no cookie). Requires the `bearer()` plugin, which turns
 * `Authorization: Bearer <token>` into a session lookup. Suspension collapses
 * to null here as well (the WS layers have no structured error reply).
 */
export async function authenticateSessionToken(
  token: string
): Promise<AuthenticatedRequestSession | null> {
  const headers = new UndiciHeaders({ authorization: `Bearer ${token}` })
  const result = await auth.api.getSession({
    headers: headers as unknown as Headers,
  })
  return toAuthenticatedOrNull(
    await guardResolvedSession(toAuthenticated(result))
  )
}

/**
 * Resolve the session for an incoming Fastify request from its headers,
 * collapsing suspension to "not authenticated" (null). Non-middleware callers
 * (log ingest fallback) keep the old shape.
 */
export async function authenticateRequestSession(
  request: FastifyRequest
): Promise<AuthenticatedRequestSession | null> {
  return toAuthenticatedOrNull(await resolveSessionFromHeaders(request.headers))
}
