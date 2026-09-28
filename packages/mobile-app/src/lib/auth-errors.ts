import { ApiError } from "@/lib/api"

/**
 * Map an auth failure to one of three user-facing messages. We deliberately do
 * NOT distinguish "email not registered" from "wrong password" (that leaks which
 * addresses have accounts, and the backend (better-auth) collapses them by
 * design).
 *
 *   - 429                       -> rate limited
 *   - 401 / bad credentials     -> incorrect email or password
 *   - other (network/5xx/unknown) -> generic fallback (overridable per screen)
 *
 * `fallback` overrides only the third bucket, so screens with a more specific
 * generic message (e.g. the QR flow) can keep theirs.
 */
export function getAuthErrorMessage(
  error: unknown,
  fallback = "Network or service error. Please try again later."
): string {
  const status = error instanceof ApiError ? error.status : undefined
  const code = error instanceof ApiError ? error.code : undefined

  if (status === 429) {
    return "Too many attempts. Please try again later."
  }
  if (status === 401 || code === "INVALID_EMAIL_OR_PASSWORD") {
    return "Incorrect email or password."
  }
  return fallback
}
