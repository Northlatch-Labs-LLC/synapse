/**
 * Unit tests for the pure email content builders (password reset URL + copy,
 * welcome copy). No env, no fetch, no network — the builders take primitives
 * and return the sendPlatformEmail payload shape.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  buildPasswordResetEmail,
  buildPasswordResetUrl,
  buildWelcomeEmail,
  PASSWORD_RESET_PATH,
} from "./content.js"

test("buildPasswordResetUrl joins the web origin and encodes the token", () => {
  assert.equal(
    buildPasswordResetUrl("https://synappse.work", "tok123"),
    `https://synappse.work${PASSWORD_RESET_PATH}?token=tok123`
  )
})

test("buildPasswordResetUrl tolerates a trailing slash in the base URL", () => {
  assert.equal(
    buildPasswordResetUrl("https://synappse.work/", "tok"),
    `https://synappse.work${PASSWORD_RESET_PATH}?token=tok`
  )
})

test("buildPasswordResetUrl percent-encodes unsafe token characters", () => {
  const url = buildPasswordResetUrl("https://synappse.work", "a&b/c d")
  assert.ok(url.endsWith("token=a%26b%2Fc%20d"), url)
  assert.ok(!url.includes("a&b"), url)
})

test("buildPasswordResetEmail returns the sendPlatformEmail shape", () => {
  const url = buildPasswordResetUrl("https://synappse.work", "tok")
  const email = buildPasswordResetEmail({ url, name: "Ada" })
  assert.equal(email.subject, "Reset your Synappse password")
  assert.ok(email.html.includes("Ada"))
  assert.ok(email.html.includes(`href="${url}"`))
  assert.ok(email.text.includes(url))
})

test("buildPasswordResetEmail works without a name", () => {
  const email = buildPasswordResetEmail({
    url: "https://synappse.work/auth/reset-password?token=x",
  })
  assert.ok(email.text.includes("Hi,"))
  assert.ok(!email.html.includes("Hi undefined"))
})

test("buildPasswordResetEmail honours a custom expiry in the copy", () => {
  const email = buildPasswordResetEmail({
    url: "https://synappse.work/auth/reset-password?token=x",
    expiresInMinutes: 30,
  })
  assert.ok(email.html.includes("expires in 30 minutes"))
  assert.ok(email.text.includes("expires in 30 minutes"))
})

test("buildPasswordResetEmail defaults the expiry copy to 60 minutes", () => {
  const email = buildPasswordResetEmail({
    url: "https://synappse.work/auth/reset-password?token=x",
  })
  assert.ok(email.html.includes("expires in 60 minutes"))
})

test("buildPasswordResetEmail escapes html-sensitive name characters", () => {
  const email = buildPasswordResetEmail({
    url: "https://synappse.work/auth/reset-password?token=x",
    name: '<b>"Eve" & co</b>',
  })
  assert.ok(!email.html.includes("<b>"), email.html)
  assert.ok(email.html.includes("&lt;b&gt;"))
})

test("buildWelcomeEmail returns subject/html/text with the address", () => {
  const email = buildWelcomeEmail({ email: "ada@example.com", name: "Ada" })
  assert.equal(email.subject, "Welcome to Synappse")
  assert.ok(email.html.includes("ada@example.com"))
  assert.ok(email.html.includes("Ada"))
  assert.ok(email.text.includes("Your Synappse account is ready"))
})

test("buildWelcomeEmail works without a name", () => {
  const email = buildWelcomeEmail({ email: "x@example.com" })
  assert.ok(email.html.includes("Hi,"))
  assert.ok(!email.html.includes("Hi undefined"))
})
