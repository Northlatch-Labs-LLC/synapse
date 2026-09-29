// Signed audit export — ed25519 detached signatures over the canonical
// export bundle (G-S1 gate: "audit export produces a signed file").
//
// Key handling is fail-closed: the signing key arrives via
// AUDIT_EXPORT_SIGNING_KEY (base64 PKCS8). Without it the export route
// refuses with 503 instead of emitting an unsigned file — an audit artifact
// that cannot be verified is worse than no artifact. Generate with:
//   node scripts/verify-audit-export.mjs --generate > audit-signing-key.b64
// The verifier only needs the public key, which the manifest carries as a
// SHA-256 fingerprint (keyId); verification tooling takes the public key
// explicitly so a leaked manifest can't smuggle its own verifier key.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  type KeyObject,
} from "node:crypto"

const EXPORT_NAMESPACE = "synapse-audit-export/v1"

export class AuditExportKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuditExportKeyError"
  }
}

export interface AuditSigningKeys {
  privateKey: KeyObject
  publicKey: KeyObject
  keyId: string
}

/** SHA-256 fingerprint of the SPKI public key — the stable key id. */
export function auditKeyId(publicKey: KeyObject): string {
  return createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex")
}

export function generateAuditExportKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  }
}

/** Parse AUDIT_EXPORT_SIGNING_KEY (base64 PKCS8 PEM). Throws AuditExportKeyError on bad input. */
export function loadAuditSigningKey(encoded: string): AuditSigningKeys {
  const trimmed = encoded.trim()
  if (!trimmed) {
    throw new AuditExportKeyError("AUDIT_EXPORT_SIGNING_KEY is not configured")
  }
  let pem: string
  try {
    pem = Buffer.from(trimmed, "base64").toString("utf8")
  } catch {
    throw new AuditExportKeyError("AUDIT_EXPORT_SIGNING_KEY is not valid base64")
  }
  try {
    const privateKey = createPrivateKey(pem)
    if (privateKey.asymmetricKeyType !== "ed25519") {
      throw new AuditExportKeyError(`AUDIT_EXPORT_SIGNING_KEY is ${privateKey.asymmetricKeyType}, expected ed25519`)
    }
    const publicKey = createPublicKey(privateKey)
    return { privateKey, publicKey, keyId: auditKeyId(publicKey) }
  } catch (error) {
    if (error instanceof AuditExportKeyError) throw error
    throw new AuditExportKeyError(`AUDIT_EXPORT_SIGNING_KEY is not a parseable PKCS8 PEM key: ${(error as Error).message}`)
  }
}

export function signCanonicalPayload(keys: AuditSigningKeys, canonicalPayload: string): string {
  const signature = edSign(null, Buffer.from(canonicalPayload, "utf8"), keys.privateKey)
  return signature.toString("base64")
}

export function verifyCanonicalPayload(
  publicKeyPem: string,
  canonicalPayload: string,
  signatureBase64: string
): boolean {
  let publicKey: KeyObject
  try {
    publicKey = createPublicKey(publicKeyPem)
  } catch {
    return false
  }
  if (publicKey.asymmetricKeyType !== "ed25519") return false
  let signature: Buffer
  try {
    signature = Buffer.from(signatureBase64, "base64")
  } catch {
    return false
  }
  return edVerify(null, Buffer.from(canonicalPayload, "utf8"), publicKey, signature)
}

export const AUDIT_EXPORT_NAMESPACE = EXPORT_NAMESPACE
