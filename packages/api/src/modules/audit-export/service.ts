// Signed audit export — bundle assembly (G-S1).
//
// The export is a single JSON file: a namespace header, the event payload
// from runtime_events (workspace-scoped, optionally time-ranged), and a
// detached ed25519 signature over the CANONICAL serialization. The
// canonical form is the payload JSON with sorted object keys and no
// insignificant whitespace, produced by a single stable stringify — never
// JSON.stringify on arbitrary objects, whose key order follows insertion.
// The verifier (scripts/verify-audit-export.mjs) recomputes exactly this.
// SQL lives in ./repo.ts (layering rules r6/g2/r8).

import { createHash } from "node:crypto"
import { serializeNowInstant, type IsoInstantString } from "../../infrastructure/datetime.js"
import {
  AUDIT_EXPORT_NAMESPACE,
  signCanonicalPayload,
  type AuditSigningKeys,
} from "./signing.js"

export interface AuditExportEventRow {
  id: string
  conversationId: string | null
  sessionId: string | null
  turnId: string | null
  toolCallId: string | null
  actorId: string | null
  userId: string | null
  source: string
  level: string
  eventType: string
  payload: unknown
  createdAt: IsoInstantString
}

export interface AuditExportRange {
  from?: Date
  to?: Date
}

export interface AuditExportBundle {
  format: typeof AUDIT_EXPORT_NAMESPACE
  workspaceId: string
  generatedAt: IsoInstantString
  eventCount: number
  digest: string
  events: Array<Record<string, unknown>>
  signature: {
    alg: "ed25519"
    keyId: string
    signedAt: IsoInstantString
    value: string
  }
}

/** Deterministic JSON: sorted keys at every depth, no whitespace. */
export function canonicalStringify(value: unknown): string {
  const canonicalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonicalize)
    if (input !== null && typeof input === "object") {
      const sorted: Record<string, unknown> = {}
      for (const key of Object.keys(input as Record<string, unknown>).sort()) {
        sorted[key] = canonicalize((input as Record<string, unknown>)[key])
      }
      return sorted
    }
    return input
  }
  return JSON.stringify(canonicalize(value))
}

export function buildSignedBundle(
  keys: AuditSigningKeys,
  workspaceId: string,
  events: Array<Record<string, unknown>>
): AuditExportBundle {
  const now = serializeNowInstant()
  const digest = createHash("sha256").update(canonicalStringify(events), "utf8").digest("hex")
  const header = {
    format: AUDIT_EXPORT_NAMESPACE,
    workspaceId,
    generatedAt: now,
    eventCount: events.length,
    digest,
  }
  // Signature covers header + events — tampering with either breaks it.
  const canonicalPayload = canonicalStringify({ header, events })
  const value = signCanonicalPayload(keys, canonicalPayload)
  return {
    format: AUDIT_EXPORT_NAMESPACE,
    workspaceId: header.workspaceId,
    generatedAt: header.generatedAt,
    eventCount: header.eventCount,
    digest: header.digest,
    events,
    signature: { alg: "ed25519", keyId: keys.keyId, signedAt: now, value },
  }
}

/** Recompute the canonical payload for a bundle (verifier parity). */
export function canonicalPayloadOfBundle(bundle: {
  format: string
  workspaceId: string
  generatedAt: string
  eventCount: number
  digest: string
  events: Array<Record<string, unknown>>
}): string {
  return canonicalStringify({
    header: {
      format: bundle.format,
      workspaceId: bundle.workspaceId,
      generatedAt: bundle.generatedAt,
      eventCount: bundle.eventCount,
      digest: bundle.digest,
    },
    events: bundle.events,
  })
}
