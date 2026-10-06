import { createLogger } from "../../infrastructure/logger/index.js"
import { resendSendEmail } from "./resend-client.js"

const log = createLogger("email")

/**
 * Outbound email (Resend-backed). Optional by design: with no RESEND_API_KEY
 * every send is a logged no-op, so the core stack runs without email exactly
 * like the other env-selected providers (embedding, OCR, transcription).
 */

export interface EmailEnv {
  resendApiKey?: string
  emailFrom?: string
}

export function emailEnvFrom(processEnv: NodeJS.ProcessEnv): EmailEnv {
  return {
    resendApiKey: processEnv.RESEND_API_KEY || undefined,
    emailFrom: processEnv.EMAIL_FROM || undefined,
  }
}

export const DEFAULT_FROM_ADDRESS = "Synappse <no-reply@synappse.work>"

export function isEmailConfigured(env: EmailEnv): boolean {
  return Boolean(env.resendApiKey)
}

export type SendEmailResult =
  | { sent: true; id: string }
  | { sent: false; reason: "not_configured" | "send_failed"; message?: string }

export interface PlatformEmailInput {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

export async function sendPlatformEmail(
  env: EmailEnv,
  input: PlatformEmailInput
): Promise<SendEmailResult> {
  if (!isEmailConfigured(env)) {
    log.info(
      { to: input.to, subject: input.subject },
      "email skipped: RESEND_API_KEY not configured"
    )
    return { sent: false, reason: "not_configured" }
  }
  try {
    const result = await resendSendEmail(env.resendApiKey as string, {
      from: env.emailFrom || DEFAULT_FROM_ADDRESS,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    })
    return { sent: true, id: result.id }
  } catch (err) {
    log.warn({ err, to: input.to, subject: input.subject }, "email send failed")
    return { sent: false, reason: "send_failed", message: String(err) }
  }
}
