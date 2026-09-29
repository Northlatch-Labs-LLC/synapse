// One-shot driver for the G-S1 gate proof: builds a signed audit-export file
// from fixture events using the production signer/bundler.
// Usage: npx tsx scripts/make-test-audit-export.ts <base64-private-key> <out.json>
import { writeFileSync } from "node:fs"
import { loadAuditSigningKey } from "../packages/api/src/modules/audit-export/signing.js"
import { buildSignedBundle } from "../packages/api/src/modules/audit-export/service.js"

const [privB64, out] = process.argv.slice(2)
if (!privB64 || !out) {
  console.error("usage: make-test-audit-export.ts <base64-private-key> <out.json>")
  process.exit(2)
}
const keys = loadAuditSigningKey(privB64)
const events = [
  { id: "e1", eventType: "runtime.grant.created", source: "tool", level: "info", payload: { capability: "filesystem", preset: "once" }, createdAt: "2026-09-27T10:00:00.000Z" },
  { id: "e2", eventType: "runtime.grant.consumed", source: "tool", level: "info", payload: { grantId: "g1" }, createdAt: "2026-09-27T10:05:00.000Z" },
  { id: "e3", eventType: "workspace.member.approved_request", source: "system", level: "audit", payload: { capability: "browser" }, createdAt: "2026-09-27T10:06:00.000Z" },
]
const bundle = buildSignedBundle(keys, "11111111-1111-1111-1111-111111111111", events)
writeFileSync(out, JSON.stringify(bundle, null, 2) + "\n")
console.log(`bundle written: ${bundle.eventCount} events, keyId ${bundle.signature.keyId.slice(0, 16)}…`)
