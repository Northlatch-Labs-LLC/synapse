#!/usr/bin/env node
/**
 * verify-audit-export — standalone verifier for signed audit export files
 * (G-S1 gate: "audit export produces a signed file").
 *
 *   node scripts/verify-audit-export.mjs --generate
 *     Prints a fresh ed25519 keypair: the base64 PKCS8 private key (for
 *     AUDIT_EXPORT_SIGNING_KEY) and the SPKI public PEM (for auditors).
 *
 *   node scripts/verify-audit-export.mjs --key public.pem export.json
 *     Exits 0 and prints the header when the signature verifies; exits 1
 *     with a reason otherwise.
 *
 * The verifier deliberately recomputes the canonical payload from scratch
 * (sorted-key stringify of header+events) rather than trusting any bytes in
 * the file beyond the public inputs — a tampered file cannot talk its way
 * past its own signature.
 */

import { readFileSync } from "node:fs"
import { createHash, createPublicKey, generateKeyPairSync, verify as edVerify } from "node:crypto"

function canonicalize(input) {
  if (Array.isArray(input)) return input.map(canonicalize)
  if (input !== null && typeof input === "object") {
    const sorted = {}
    for (const key of Object.keys(input).sort()) sorted[key] = canonicalize(input[key])
    return sorted
  }
  return input
}

const canonicalStringify = (value) => JSON.stringify(canonicalize(value))

function usage(code = 1) {
  console.error("usage: verify-audit-export.mjs --generate | --key <public.pem> <export.json>")
  process.exit(code)
}

const args = process.argv.slice(2)

if (args[0] === "--generate") {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  const privB64 = Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" }).toString(), "utf8").toString("base64")
  const keyId = createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex")
  console.log("# AUDIT_EXPORT_SIGNING_KEY (base64 PKCS8 — keep secret, set on the api):")
  console.log(privB64)
  console.log("# Auditor public key (SPKI PEM — hand to the verifier):")
  console.log(publicKey.export({ type: "spki", format: "pem" }).toString())
  console.log(`# keyId (sha256 of the SPKI DER): ${keyId}`)
  process.exit(0)
}

if (args[0] !== "--key" || args.length !== 3) usage()

const publicKeyPem = readFileSync(args[1], "utf8")
const bundle = JSON.parse(readFileSync(args[2], "utf8"))

const fail = (reason) => {
  console.error(`VERIFY FAIL: ${reason}`)
  process.exit(1)
}

if (bundle?.format !== "synapse-audit-export/v1") fail("unknown format namespace")
if (bundle?.signature?.alg !== "ed25519") fail("unsupported signature algorithm")

const header = {
  format: bundle.format,
  workspaceId: bundle.workspaceId,
  generatedAt: bundle.generatedAt,
  eventCount: bundle.eventCount,
  digest: bundle.digest,
}
const canonical = canonicalStringify({ header, events: bundle.events })

const digest = createHash("sha256").update(canonicalStringify(bundle.events), "utf8").digest("hex")
if (digest !== bundle.digest) fail("events digest mismatch — payload modified after signing")
if (bundle.events.length !== bundle.eventCount) fail("eventCount mismatch — events added or removed after signing")

let ok = false
try {
  ok = edVerify(null, Buffer.from(canonical, "utf8"), createPublicKey(publicKeyPem), Buffer.from(bundle.signature.value, "base64"))
} catch {
  ok = false
}
if (!ok) fail("ed25519 signature does not verify over header+events")

const keyId = createHash("sha256").update(createPublicKey(publicKeyPem).export({ type: "spki", format: "der" })).digest("hex")
if (keyId !== bundle.signature.keyId) fail(`keyId mismatch (file says ${bundle.signature.keyId}, key is ${keyId})`)

console.log("VERIFY OK")
console.log(JSON.stringify({ ...header, signedAt: bundle.signature.signedAt }, null, 2))
