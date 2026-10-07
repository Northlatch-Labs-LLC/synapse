import type { FastifyReply, FastifyRequest } from "fastify"
import { resolveSessionFromHeaders } from "../../modules/auth/service.js"
import type { AuthenticatedRequestSession } from "../../modules/auth/service.js"

async function attachAuthenticatedRequest(
  request: FastifyRequest,
  authenticated: AuthenticatedRequestSession
) {
  ;(request as any).user = {
    userId: authenticated.user.id,
    email: authenticated.user.email,
  }
  ;(request as any).authSession = authenticated.session
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Full three-way resolution: authenticated / unauthenticated / suspended.
  // The suspension verdict costs one extra indexed (primary-key) users lookup,
  // shared with the long-standing soft-delete session guard.
  const resolution = await resolveSessionFromHeaders(request.headers)
  if (resolution.kind === "authenticated") {
    await attachAuthenticatedRequest(request, resolution.session)
    return
  }

  // Platform-admin account suspension (modules/platform-users): the session
  // itself is valid, but the account is barred. A distinct 403 + code so
  // clients can show the right message instead of a re-login loop.
  if (resolution.kind === "suspended") {
    return reply.status(403).send({
      error:
        "This account has been suspended by a platform administrator. Contact support if you believe this is a mistake.",
      code: "account_suspended",
    })
  }

  // Note: we no longer clear a cookie by name here. Better Auth's session
  // cookie carries an environment-dependent `__Secure-` prefix in production,
  // so business code must not assume a fixed cookie name; an unauthenticated
  // request simply gets a 401 and the client re-authenticates.
  return reply.status(401).send({
    error: "Authentication required",
    code: "UNAUTHENTICATED",
  })
}

export async function optionalAuth(request: FastifyRequest) {
  // Optional gate: an unauthenticated OR suspended caller simply stays
  // anonymous (suspension collapses to "not authenticated" here — the routes
  // behind this hook are public previews, not member surfaces).
  const resolution = await resolveSessionFromHeaders(request.headers)
  if (resolution.kind === "authenticated") {
    await attachAuthenticatedRequest(request, resolution.session)
  }
}

export function getUserId(request: FastifyRequest): string {
  return (request as any).user?.userId
}
