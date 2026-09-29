# ADR-0002: Enterprise SSO — OIDC-first via genericOAuth; SAML/SCIM deferred behind a dependency decision

- Status: accepted (Phase G-S1)
- Date: 2026-09-27
- Deciders: S-A session lead (synapse-gs1 mission)

## Context

G-S1 calls for "SSO/SAML/SCIM (extend better-auth)". The codebase has exactly one OAuth
provider (Feishu) wired through better-auth's `genericOAuth` plugin — no SAML or SCIM anywhere.
better-auth's SAML story is a separate package (`@better-auth/sso`, BoxyHQ Jackson) that brings
an XML/Soap SSO stack; SCIM provisioning rides the same package. Adopting it is a real supply
chain + license review (Phase-0 discipline: every new dep must clear audit gates), not a
config flip.

## Decision

1. **OIDC-first**: enterprise identity via standard OIDC providers configured through the
   existing `genericOAuth` plugin — zero new dependencies, zero new session paths. Covers
   Okta, Auth0, Microsoft Entra, Google Workspace, and any SAML-only IdP through its OIDC bridge.
   Config: `SSO_OIDC_PROVIDERS` (JSON array, fail-loud validation,
   `modules/auth/sso-providers.ts`). Unset ⇒ login surface byte-identical to pre-G-S1 (INV-S1).
2. **SAML**: deferred to a founder-ratified dependency decision on `@better-auth/sso`
   (license + audit + ops review). This ADR is the record that it is a decision, not an omission.
3. **SCIM**: same gate. The G-S1 pilot criterion ("a pilot org runs with SSO") is met by OIDC;
   SCIM user provisioning belongs with the Governance Console phase where workspace membership
   management gets its UI.

## Consequences

- Pilot orgs can onboard immediately with OIDC; SAML-only tenants have a documented bridge path.
- `@better-auth/sso` evaluation becomes a named backlog item with explicit entry criteria
  (Apache-2.0-compatible license, clean audit, SBOM entry, load-tested XML parsing).
- Account-linking stays fail-closed (`disableImplicitLinking: true` upstream config) — SSO
  identities cannot silently take over existing email-matched accounts.
