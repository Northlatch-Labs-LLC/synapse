import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Minimal Stripe REST client + webhook signature verification. Deliberately
 * dependency-free (PLAN-billing: "zero new deps") — the four endpoints we need
 * (customers, checkout sessions, billing portal sessions, events via webhook)
 * are plain form-encoded POSTs.
 */

const STRIPE_API_BASE = "https://api.stripe.com/v1"

export class StripeClientError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "StripeClientError"
  }
}

type JsonRecord = Record<string, unknown>

/** Form-encodes nested params the Stripe way: a[b]=c. */
export function encodeStripeParams(
  params: Record<string, string | number | boolean | undefined>
): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    parts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    )
  }
  return parts.join("&")
}

export async function stripeRequest(
  apiKey: string,
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<JsonRecord> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params ? encodeStripeParams(params) : "",
  })
  const text = await response.text()
  // External provider boundary: the body is a Stripe REST API response.
  const json = JSON.parse(text) as JsonRecord
  if (!response.ok) {
    const err = json.error as { message?: string } | undefined
    throw new StripeClientError(
      err?.message || `Stripe request failed (${response.status})`,
      response.status
    )
  }
  return json
}

export interface CheckoutSessionInput {
  customerId: string
  priceId: string
  quantity: number
  successUrl: string
  cancelUrl: string
  clientReferenceId: string
  workspaceId: string
}

export async function createCheckoutSession(
  apiKey: string,
  input: CheckoutSessionInput
): Promise<{ id: string; url: string }> {
  const session = await stripeRequest(apiKey, "/checkout/sessions", {
    mode: "subscription",
    customer: input.customerId,
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": input.quantity,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.clientReferenceId,
    "metadata[workspaceId]": input.workspaceId,
    "subscription_data[metadata][workspaceId]": input.workspaceId,
  })
  return { id: String(session.id), url: String(session.url) }
}

export async function createBillingPortalSession(
  apiKey: string,
  customerId: string,
  returnUrl: string
): Promise<{ url: string }> {
  const session = await stripeRequest(apiKey, "/billing_portal/sessions", {
    customer: customerId,
    return_url: returnUrl,
  })
  return { url: String(session.url) }
}

export async function createCustomer(
  apiKey: string,
  input: { email?: string; workspaceId: string; workspaceName: string }
): Promise<{ id: string }> {
  const customer = await stripeRequest(apiKey, "/customers", {
    email: input.email,
    name: input.workspaceName,
    "metadata[workspaceId]": input.workspaceId,
  })
  return { id: String(customer.id) }
}

// ── Webhook signature (Stripe spec: t=<ts>,v1=<hmac>; HMAC-SHA256 of
// "<ts>.<payload>" with the endpoint secret; reject stale timestamps). ──

export function verifyStripeSignature(input: {
  payload: string
  signatureHeader: string | undefined
  secret: string
  nowMs?: number
  toleranceMs?: number
}): boolean {
  const tolerance = input.toleranceMs ?? 300_000
  if (!input.signatureHeader) return false
  let timestamp: string | undefined
  const signatures: string[] = []
  for (const part of input.signatureHeader.split(",")) {
    const [key, value] = part.split("=", 2)
    if (key === "t") timestamp = value
    else if (key === "v1" && value) signatures.push(value)
  }
  if (!timestamp || signatures.length === 0) return false
  // datetime-ok: injectable verification clock — the default is the webhook's
  // server receive time, a deliberate "now", not a masked value.
  const age = (input.nowMs ?? Date.now()) - Number(timestamp) * 1000
  if (!Number.isFinite(age) || age < -tolerance || age > tolerance) {
    return false
  }
  const expected = createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.payload}`)
    .digest()
  for (const provided of signatures) {
    const providedBuf = Buffer.from(provided, "hex")
    if (
      providedBuf.length === expected.length &&
      timingSafeEqual(providedBuf, expected)
    ) {
      return true
    }
  }
  return false
}
