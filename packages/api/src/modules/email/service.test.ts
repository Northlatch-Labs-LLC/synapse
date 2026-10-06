/**
 * Unit tests for the email surface: env mapping, configured-detection, the
 * not-configured no-op, and the Resend HTTP boundary via a stubbed fetch
 * (no network). Mirrors stripe-client.test.ts conventions.
 */
import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_FROM_ADDRESS,
  emailEnvFrom,
  isEmailConfigured,
  sendPlatformEmail,
} from "./service.js"
import { ResendClientError, resendSendEmail } from "./resend-client.js"

function stubFetch(
  status: number,
  body: string
): { calls: { url: string; init: RequestInit }[]; restore: () => void } {
  const calls: { url: string; init: RequestInit }[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url, init })
    return new Response(body, { status })
  }) as typeof fetch
  return { calls, restore: () => (globalThis.fetch = original) }
}

test("emailEnvFrom maps env vars and drops empties", () => {
  const configured = emailEnvFrom({
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "Synappse <hello@synappse.work>",
  })
  assert.equal(configured.resendApiKey, "re_test_key")
  assert.equal(configured.emailFrom, "Synappse <hello@synappse.work>")

  const blank = emailEnvFrom({ RESEND_API_KEY: "", EMAIL_FROM: "" })
  assert.equal(blank.resendApiKey, undefined)
  assert.equal(blank.emailFrom, undefined)
})

test("isEmailConfigured requires the API key only", () => {
  assert.equal(isEmailConfigured({ resendApiKey: "re_x" }), true)
  assert.equal(isEmailConfigured({}), false)
  assert.equal(isEmailConfigured({ emailFrom: "x@y.z" }), false)
})

test("sendPlatformEmail no-ops when not configured", async () => {
  const { calls, restore } = stubFetch(200, "{}")
  try {
    const result = await sendPlatformEmail(
      {},
      {
        to: "ops@northlatch.dev",
        subject: "Test",
        html: "<p>Test</p>",
      }
    )
    assert.deepEqual(result, { sent: false, reason: "not_configured" })
    assert.equal(calls.length, 0)
  } finally {
    restore()
  }
})

test("resendSendEmail posts JSON and returns the id", async () => {
  const { calls, restore } = stubFetch(200, '{"id":"49a3999c"}')
  try {
    const result = await resendSendEmail("re_test_key", {
      from: DEFAULT_FROM_ADDRESS,
      to: "ops@northlatch.dev",
      subject: "Test",
      html: "<p>Test</p>",
    })
    assert.deepEqual(result, { id: "49a3999c" })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "https://api.resend.com/emails")
    const headers = calls[0].init.headers as Record<string, string>
    assert.equal(headers["Authorization"], "Bearer re_test_key")
    const body = JSON.parse(String(calls[0].init.body)) as Record<
      string,
      unknown
    >
    assert.equal(body.from, DEFAULT_FROM_ADDRESS)
  } finally {
    restore()
  }
})

test("resendSendEmail raises ResendClientError with the provider message", async () => {
  const { restore } = stubFetch(422, '{"message":"Invalid `to` field"}')
  try {
    await assert.rejects(
      resendSendEmail("re_test_key", {
        from: DEFAULT_FROM_ADDRESS,
        to: "not-an-email",
        subject: "Test",
        html: "<p></p>",
      }),
      (err: unknown) =>
        err instanceof ResendClientError &&
        err.status === 422 &&
        err.message === "Invalid `to` field"
    )
  } finally {
    restore()
  }
})

test("sendPlatformEmail maps provider failures to send_failed", async () => {
  const { restore } = stubFetch(500, '{"message":"boom"}')
  try {
    const result = await sendPlatformEmail(
      { resendApiKey: "re_test_key" },
      { to: "ops@northlatch.dev", subject: "Test", html: "<p></p>" }
    )
    assert.equal(result.sent, false)
    if (!result.sent) {
      assert.equal(result.reason, "send_failed")
    }
  } finally {
    restore()
  }
})

test("sendPlatformEmail falls back to the default from-address", async () => {
  const { calls, restore } = stubFetch(200, '{"id":"x"}')
  try {
    await sendPlatformEmail(
      { resendApiKey: "re_test_key" },
      { to: "ops@northlatch.dev", subject: "Test", html: "<p></p>" }
    )
    const body = JSON.parse(String(calls[0].init.body)) as Record<
      string,
      unknown
    >
    assert.equal(body.from, DEFAULT_FROM_ADDRESS)
  } finally {
    restore()
  }
})
