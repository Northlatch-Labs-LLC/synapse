import test from "node:test"
import assert from "node:assert/strict"
import { createHash, createPublicKey } from "node:crypto"
import {
  AUDIT_EXPORT_NAMESPACE,
  auditKeyId,
  AuditExportKeyError,
  generateAuditExportKeyPair,
  loadAuditSigningKey,
  signCanonicalPayload,
  verifyCanonicalPayload,
} from "./signing.js"
import {
  buildSignedBundle,
  canonicalPayloadOfBundle,
  canonicalStringify,
} from "./service.js"

function makeKeys() {
  const { privateKeyPem, publicKeyPem } = generateAuditExportKeyPair()
  return {
    keys: loadAuditSigningKey(Buffer.from(privateKeyPem, "utf8").toString("base64")),
    publicKeyPem,
  }
}

test("audit-export: generate → load round-trip preserves the key identity", () => {
  const { keys, publicKeyPem } = makeKeys()
  assert.equal(keys.keyId, auditKeyId(createPublicKey(publicKeyPem)))
})

test("audit-export: loadAuditSigningKey is fail-closed on garbage", () => {
  assert.throws(() => loadAuditSigningKey(""), AuditExportKeyError)
  assert.throws(() => loadAuditSigningKey("!!!not-base64!!!"), AuditExportKeyError)
  // Valid base64, not a key.
  assert.throws(() => loadAuditSigningKey(Buffer.from("hello").toString("base64")), AuditExportKeyError)
})

test("audit-export: sign → verify round-trip over canonical payload", () => {
  const { keys, publicKeyPem } = makeKeys()
  const payload = canonicalStringify({ b: 1, a: [{ z: 1, y: 2 }] })
  const signature = signCanonicalPayload(keys, payload)
  assert.ok(verifyCanonicalPayload(publicKeyPem, payload, signature))
})

test("audit-export: tampered payload or signature fails verification", () => {
  const { keys, publicKeyPem } = makeKeys()
  const payload = canonicalStringify({ events: [{ id: "1", eventType: "tool.call" }] })
  const signature = signCanonicalPayload(keys, payload)
  assert.ok(!verifyCanonicalPayload(publicKeyPem, payload + " ", signature))
  assert.ok(!verifyCanonicalPayload(publicKeyPem, payload, signature.slice(0, -4) + "AAAA"))
})

test("audit-export: canonicalStringify is key-order independent and stable", () => {
  const a = canonicalStringify({ x: 1, nested: { b: 2, a: [3, { q: 1, p: 2 }] } })
  const b = canonicalStringify({ nested: { a: [3, { p: 2, q: 1 }], b: 2 }, x: 1 })
  assert.equal(a, b)
  assert.equal(a, '{"nested":{"a":[3,{"p":2,"q":1}],"b":2},"x":1}')
})

test("audit-export: bundle signature covers header AND events (tamper both)", () => {
  const { keys, publicKeyPem } = makeKeys()
  const events = [
    { id: "e1", eventType: "grant.consumed", payload: { capability: "filesystem" }, createdAt: "2026-09-27T00:00:00.000Z" },
    { id: "e2", eventType: "tool.call", payload: {}, createdAt: "2026-09-27T00:01:00.000Z" },
  ]
  const bundle = buildSignedBundle(keys, "ws-1", events)

  // Verifier parity: canonicalPayloadOfBundle matches what was signed.
  const canonical = canonicalPayloadOfBundle(bundle)
  assert.ok(verifyCanonicalPayload(publicKeyPem, canonical, bundle.signature.value))

  // Digest actually covers the events.
  assert.equal(bundle.digest, createHash("sha256").update(canonicalStringify(events), "utf8").digest("hex"))
  assert.equal(bundle.format, AUDIT_EXPORT_NAMESPACE)
  assert.equal(bundle.eventCount, 2)

  // Tamper with one event → verification fails.
  const tamperedEvents = {
    ...bundle,
    events: [{ ...events[0], payload: { capability: "browser" } }, events[1]],
  }
  assert.ok(!verifyCanonicalPayload(publicKeyPem, canonicalPayloadOfBundle(tamperedEvents), bundle.signature.value))

  // Tamper with the count header → verification fails.
  const tamperedHeader = { ...bundle, eventCount: 1 }
  assert.ok(!verifyCanonicalPayload(publicKeyPem, canonicalPayloadOfBundle(tamperedHeader), bundle.signature.value))
})
