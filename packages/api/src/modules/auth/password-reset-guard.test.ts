// Password-reset early guard (auth/index.ts): without outbound email the
// sendResetPassword hook could only log while Better Auth answered the neutral
// success, so the web reset page would show a dead-end "check your inbox".
// These tests pin the exact route/method matching of that 503 guard — the
// riskiest part is the pathname, which must track the endpoint the web client
// actually calls (lib/api.ts requestPasswordReset → /auth/request-password-reset).

import test from "node:test"
import assert from "node:assert/strict"
import { isPasswordResetEmailUnavailable } from "./index.js"

const RESET_PATH = "/api/v1/auth/request-password-reset"

function withResendKey(value: string | undefined, fn: () => void) {
  const previous = process.env.RESEND_API_KEY
  if (value === undefined) {
    delete process.env.RESEND_API_KEY
  } else {
    process.env.RESEND_API_KEY = value
  }
  try {
    fn()
  } finally {
    if (previous === undefined) {
      delete process.env.RESEND_API_KEY
    } else {
      process.env.RESEND_API_KEY = previous
    }
  }
}

test("password-reset guard 503s only the reset request when email is unconfigured", () => {
  withResendKey(undefined, () => {
    assert.equal(isPasswordResetEmailUnavailable("POST", RESET_PATH), true)
  })
})

test("password-reset guard ignores other methods, paths, and configured email", () => {
  withResendKey(undefined, () => {
    // Wrong method (the reset CONSUME page is a GET on the web app; the BA
    // endpoint is POST-only anyway).
    assert.equal(isPasswordResetEmailUnavailable("GET", RESET_PATH), false)
    // Sign-in and sign-up must NEVER be guarded — email is optional there.
    assert.equal(
      isPasswordResetEmailUnavailable("POST", "/api/v1/auth/sign-in/email"),
      false
    )
    assert.equal(
      isPasswordResetEmailUnavailable("POST", "/api/v1/auth/sign-up/email"),
      false
    )
    // Near-miss paths.
    assert.equal(
      isPasswordResetEmailUnavailable(
        "POST",
        "/api/v1/auth/request-password-reset/extra"
      ),
      false
    )
    assert.equal(
      isPasswordResetEmailUnavailable("POST", "/api/v1/auth/forget-password"),
      false
    )
  })
  withResendKey("re_test_key_placeholder", () => {
    // Configured deployment: reset requests flow to Better Auth untouched.
    assert.equal(isPasswordResetEmailUnavailable("POST", RESET_PATH), false)
  })
})
