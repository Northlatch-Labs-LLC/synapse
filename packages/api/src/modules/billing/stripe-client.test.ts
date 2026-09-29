/**
 * Unit tests for the dependency-free Stripe client surface: webhook signature
 * verification (the security-critical path — an unverified webhook would let
 * anyone flip plans) and form-param encoding.
 */
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import test from "node:test"
import { encodeStripeParams, verifyStripeSignature } from "./stripe-client.js"

const SECRET = "whsec_test_secret"

function sign(payload: string, timestampSec: number): string {
  const mac = createHmac("sha256", SECRET)
    .update(`${timestampSec}.${payload}`)
    .digest("hex")
  return `t=${timestampSec},v1=${mac}`
}

const NOW_MS = 1_790_000_000_000

test("verifyStripeSignature accepts a well-formed signature", () => {
  const payload = JSON.stringify({
    id: "evt_1",
    type: "checkout.session.completed",
  })
  const ts = Math.floor(NOW_MS / 1000)
  assert.equal(
    verifyStripeSignature({
      payload,
      signatureHeader: sign(payload, ts),
      secret: SECRET,
      nowMs: NOW_MS,
    }),
    true
  )
})

test("verifyStripeSignature rejects a tampered payload", () => {
  const payload = '{"type":"checkout.session.completed"}'
  const ts = Math.floor(NOW_MS / 1000)
  const header = sign(payload, ts)
  assert.equal(
    verifyStripeSignature({
      payload: payload.replace("completed", "completed-x"),
      signatureHeader: header,
      secret: SECRET,
      nowMs: NOW_MS,
    }),
    false
  )
})

test("verifyStripeSignature rejects a stale timestamp outside tolerance", () => {
  const payload = "{}"
  const staleTs = Math.floor(NOW_MS / 1000) - 3600
  assert.equal(
    verifyStripeSignature({
      payload,
      signatureHeader: sign(payload, staleTs),
      secret: SECRET,
      nowMs: NOW_MS,
    }),
    false
  )
})

test("verifyStripeSignature rejects the wrong secret and missing header", () => {
  const payload = "{}"
  const ts = Math.floor(NOW_MS / 1000)
  assert.equal(
    verifyStripeSignature({
      payload,
      signatureHeader: sign(payload, ts),
      secret: "whsec_other",
      nowMs: NOW_MS,
    }),
    false
  )
  assert.equal(
    verifyStripeSignature({
      payload,
      signatureHeader: undefined,
      secret: SECRET,
      nowMs: NOW_MS,
    }),
    false
  )
})

test("encodeStripeParams encodes keys and values and skips undefined", () => {
  assert.equal(
    encodeStripeParams({
      "line_items[0][price]": "price_1",
      quantity: 3,
      skip: undefined,
    }),
    "line_items%5B0%5D%5Bprice%5D=price_1&quantity=3"
  )
})
