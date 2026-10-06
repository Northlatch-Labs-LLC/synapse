/**
 * Minimal Resend REST client. Deliberately dependency-free (mirrors
 * stripe-client.ts): pure functions, the API key is always passed in, and the
 * only endpoint we need is POST /emails with a JSON body.
 */

const RESEND_API_BASE = "https://api.resend.com"

export class ResendClientError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "ResendClientError"
  }
}

export interface ResendEmailPayload {
  from: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string | string[]
}

export async function resendSendEmail(
  apiKey: string,
  payload: ResendEmailPayload
): Promise<{ id: string }> {
  const response = await fetch(`${RESEND_API_BASE}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  // External provider boundary: the body should be a Resend REST API
  // response, but a proxy/HTML error page is possible — parse defensively.
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    // Handled by the !response.ok branch below.
  }
  if (!response.ok) {
    const message =
      typeof json.message === "string"
        ? json.message
        : `Resend request failed (${response.status})`
    throw new ResendClientError(message, response.status)
  }
  return { id: typeof json.id === "string" ? json.id : "" }
}
