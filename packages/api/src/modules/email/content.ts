/**
 * Pure content builders for platform emails (password reset, welcome).
 *
 * Deliberately dependency-free and side-effect free: they take primitives and
 * return the subject/html/text triple that sendPlatformEmail consumes, so the
 * copy is unit-testable without stubbing fetch or env (mirrors the stripe-client
 * "pure functions" convention). User-facing copy is English-only.
 */

/** Better Auth's default resetPasswordTokenExpiresIn is 3600s = 60 minutes. */
export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 60

/** Web route (under packages/web-next) that consumes the reset token. */
export const PASSWORD_RESET_PATH = "/auth/reset-password"

/**
 * Absolute URL of the reset-password page carrying the token.
 *
 * Better Auth's own generated `url` points at `${baseURL}/reset-password/<token>`
 * (an API route no web page serves); the contract explicitly allows sending the
 * token instead and building a custom route, which is what this does.
 */
export function buildPasswordResetUrl(baseUrl: string, token: string): string {
  const origin = baseUrl.trim().replace(/\/+$/, "")
  return `${origin}${PASSWORD_RESET_PATH}?token=${encodeURIComponent(token)}`
}

export interface PasswordResetEmailInput {
  /** Absolute reset URL (buildPasswordResetUrl). */
  url: string
  /** Recipient display name, when known. */
  name?: string
  /** How long the link stays valid, in minutes (drives the copy). */
  expiresInMinutes?: number
}

export function buildPasswordResetEmail(input: PasswordResetEmailInput): {
  subject: string
  html: string
  text: string
} {
  const minutes = input.expiresInMinutes ?? PASSWORD_RESET_TOKEN_TTL_MINUTES
  const greeting = input.name ? `Hi ${input.name},` : "Hi,"
  const subject = "Reset your Synappse password"
  const text = [
    greeting,
    "",
    "We received a request to reset your Synappse password.",
    `Open the link below to choose a new one. It expires in ${minutes} minutes:`,
    input.url,
    "",
    "If you didn't request this, you can safely ignore this email — your password stays unchanged.",
  ].join("\n")
  const html = `\
<p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
<p style="margin:0 0 12px">We received a request to reset your Synappse password. Click the button below to choose a new one.</p>
<p style="margin:0 0 16px">
  <a href="${escapeAttribute(input.url)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600">Reset password</a>
</p>
<p style="margin:0 0 12px">This link expires in ${minutes} minutes. If the button doesn't work, paste this URL into your browser:</p>
<p style="margin:0 0 16px;word-break:break-all"><a href="${escapeAttribute(input.url)}">${escapeHtml(input.url)}</a></p>
<p style="margin:0">If you didn't request this, you can safely ignore this email — your password stays unchanged.</p>`
  return { subject, html, text }
}

export interface WelcomeEmailInput {
  email: string
  /** Recipient display name, when known. */
  name?: string
}

export function buildWelcomeEmail(input: WelcomeEmailInput): {
  subject: string
  html: string
  text: string
} {
  const greeting = input.name ? `Hi ${input.name},` : "Hi,"
  const subject = "Welcome to Synappse"
  const text = [
    greeting,
    "",
    "Your Synappse account is ready.",
    "Sign in and set up your workspace — invite teammates, connect your tools, and create your first actor.",
    "",
    "If you didn't create this account, you can safely ignore this email.",
  ].join("\n")
  const html = `\
<p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
<p style="margin:0 0 12px">Your Synappse account (${escapeHtml(input.email)}) is ready.</p>
<p style="margin:0 0 16px">Sign in and set up your workspace — invite teammates, connect your tools, and create your first actor.</p>
<p style="margin:0">If you didn't create this account, you can safely ignore this email.</p>`
  return { subject, html, text }
}

/** Escape for HTML text content (order matters: & first). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Escape for a double-quoted HTML attribute. */
function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;")
}
