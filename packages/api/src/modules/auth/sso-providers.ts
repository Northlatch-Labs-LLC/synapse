// Enterprise SSO provider construction (G-S1).
//
// Providers come from SSO_OIDC_PROVIDERS (JSON array, see .env.example) and
// ride the SAME better-auth genericOAuth plugin the Feishu provider uses —
// no new auth dependency, no new session path. Unset ⇒ empty list ⇒ the
// login surface is byte-identical to pre-G-S1 (INV-S1).
//
// SAML and SCIM are deliberately NOT here: SAML needs an XML/Soap stack
// (@better-auth/sso / BoxyHQ Jackson — a dependency decision, see
// docs/adr/0002-sso-strategy-oidc-first.md) and SCIM provisioning rides the
// same decision. Enterprise IdPs that matter (Okta, Auth0, Entra, Google
// Workspace) all speak OIDC; SAML-only tenants are served by their IdP's
// OIDC bridge until that ADR lands.

import { z } from "zod"
import { config } from "../../config/index.js"
import { createLogger } from "../../infrastructure/logger/index.js"
import type { GenericOAuthConfig } from "better-auth/plugins"

const log = createLogger("auth.sso")

export interface SsoOidcProviderConfig {
  id: string
  name: string
  clientId: string
  clientSecret: string
  authorizationUrl: string
  tokenUrl: string
  userInfoUrl: string
  scopes: string[]
}

const SsoOidcProviderSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "id must be a short lowercase slug (used in URLs: /api/v1/auth/sign-in/oauth2/sso-<id>)"),
  name: z.string().min(1).max(64),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  authorizationUrl: z.string().url().refine((u) => u.startsWith("https://"), "must be an https URL"),
  tokenUrl: z.string().url().refine((u) => u.startsWith("https://"), "must be an https URL"),
  userInfoUrl: z.string().url().refine((u) => u.startsWith("https://"), "must be an https URL"),
  scopes: z.array(z.string().min(1)).min(1).default(["openid", "email", "profile"]),
})

export class SsoConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SsoConfigError"
  }
}

export function parseSsoOidcProviders(raw: string): SsoOidcProviderConfig[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    throw new SsoConfigError(`SSO_OIDC_PROVIDERS is not valid JSON: ${(error as Error).message}`)
  }
  const result = z.array(SsoOidcProviderSchema).safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")
    throw new SsoConfigError(`SSO_OIDC_PROVIDERS failed validation: ${issues}`)
  }
  const seen = new Set<string>()
  for (const provider of result.data) {
    if (seen.has(provider.id)) {
      throw new SsoConfigError(`SSO_OIDC_PROVIDERS: duplicate provider id "${provider.id}"`)
    }
    seen.add(provider.id)
  }
  return result.data
}

/** genericOAuth provider entries for enterprise SSO (providerId: sso-<id>). */
export function buildSsoOidcProviders(): GenericOAuthConfig[] {
  const providers = parseSsoOidcProviders(config.sso.oidcProvidersRaw)
  if (providers.length === 0) return []
  log.info({ count: providers.length }, "Enterprise SSO enabled (OIDC providers)")
  return providers.map((provider): GenericOAuthConfig => ({
    providerId: `sso-${provider.id}`,
    clientId: provider.clientId,
    clientSecret: provider.clientSecret,
    authorizationUrl: provider.authorizationUrl,
    tokenUrl: provider.tokenUrl,
    userInfoUrl: provider.userInfoUrl,
    scopes: provider.scopes,
    // Standard OIDC userinfo: {sub, email, name, picture?}. Identity is NOT
    // mapped here — OAuthMappedUser's `id` is `never` by design; the provider
    // subject (sub) becomes accountSubject automatically. Some IdPs omit
    // email for privacy — fall back to a stable synthetic address so account
    // linking has something deterministic to hold on to (never verified).
    mapProfileToUser: (profile) => ({
      name: profile.name ?? `SSO user (${provider.name})`,
      email:
        profile.email && profile.email.includes("@")
          ? profile.email
          : `sso-${provider.id}-${String(profile.sub ?? "unknown")}@sso.invalid`,
      emailVerified: profile.emailVerified === true,
      image: typeof profile.picture === "string" ? profile.picture : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  }))
}
