# GATE G-S1 — Enterprise spine, first slice — evidence pack

Mission: synapse-gs1 · Session: S-A · Date: 2026-09-27 · Handout ref: §5 G-S1
Status: **slice delivered on branch; pilot-org criteria marked below as [MET-in-code] vs [STAGING-PENDING]**

## What shipped this slice

### 1. Signed audit export — [MET-in-code]
- `packages/api/src/modules/audit-export/`: signer (`signing.ts`), canonical bundler (`service.ts`),
  admin-gated route `GET /api/v1/workspaces/:workspaceId/audit-export?from=&to=` (`index.ts`).
- Ed25519 over the canonical (sorted-key, no-whitespace) serialization of {header, events};
  sha256 digest of events inside the signed header. Tamper-evidence verified end-to-end:
  sign → `VERIFY OK`; mutate one payload byte → `VERIFY FAIL: events digest mismatch` (transcript in
  `evidence/gs1/audit-export-transcript.txt`). Verifier: `scripts/verify-audit-export.mjs`
  (+ `--generate` for keygen); demo driver `scripts/make-test-audit-export.ts`.
- Fail-closed: no `AUDIT_EXPORT_SIGNING_KEY` ⇒ 503, never an unsigned file.
- RBAC: rides the existing workspace "manage" permission rule via the new
  `workspace.export_audit` action (workspace admins / explicit manage grants).
- Unit tests: 6/6 (`audit-export.test.ts`).

### 2. RBAC on the ledger — [MET-in-code, first enforcement]
- Gap found by survey: approve-in-chat allowed ANY workspace member — including **guests** — to
  approve runtime-authorization grants (filesystem/browser/cua/commandline capability).
- Enforcement: `resolveTaskRequest` now checks the resolver's `workspace_members.trust_level`
  INSIDE the task lock (demotion cannot race an in-flight approval); guests are rejected with
  `TaskResolverTrustLevelError` → HTTP 403 `task_resolver_forbidden_trust_level`
  (`tasks/service.ts`, `chat/task-response.ts`).
- The existing data-driven RBAC core (ACCESS_ACTIONS + PLATFORM/WORKSPACE_PERMISSION_RULES +
  evaluator) is untouched and already governs every other route surface.

### 3. Enterprise SSO (OIDC) — [MET-in-code; SAML/SCIM deferred by decision]
- `SSO_OIDC_PROVIDERS` env (JSON array) → validated (fail-loud, https-only URLs, slug ids, no
  duplicates) → better-auth `genericOAuth` providers (`modules/auth/sso-providers.ts`).
  Zero new dependencies; unset ⇒ login surface byte-identical (INV-S1).
- Identity mapping follows OAuthMappedUser's contract (accountSubject from `sub`; no local id).
- ADR-0002 records the OIDC-first strategy and the founder-facing decision on
  `@better-auth/sso` (SAML+SCIM) with entry criteria.
- Unit tests: 5/6 → final 5/5 after https-only tighten (`sso-providers.test.ts`).

### 4. Helm chart + HA topology — [MET-in-code]
- `infrastructure/helm/synapse`: api+web Deployments (replicas 2, topology spread, PDBs),
  Services, ConfigMap (incl. SSO/OTel env), Ingress (WebSocket-safe timeouts, /api/v1 split).
- HA policy: chart POINTS AT external HA Postgres/Redis (`postgresql.external`/`redis.external`
  + existingSecrets); embedded single-node options are dev/eval-only and labeled as such.
- Verified: `helm lint` 0 failures; `helm template` renders 8 objects.
- Known K8s follow-ups (documented in chart README): web NEXT_PUBLIC_* build-time inlining;
  better-auth rate-limit secondaryStorage for multi-replica (upstream better-auth.ts:330 comment).

### 5. OTel traces — [VERIFIED-WIRED; end-to-end trace tree is a staging exercise]
- Spans exist across http/pg/redis/undici + IM inbound + BullMQ jobs + devices + sandbox +
  remote agents (survey, `survey.md`); exporter gates on `OTEL_EXPORTER_OTLP_ENDPOINT`.
- The upstream @fastify/otel patch (hijacked-reply span ending + semconv-correct error
  recording) was RE-BASED from 0.20.1 to 0.21.0 (`patches/@fastify+otel+0.21.0.patch`) —
  upstream's own tip required 0.21 types but shipped a 0.20.1 patch (latent typecheck break,
  hidden behind their fk-policy red). Boot instrumentation tests: 8/8.
- Gap (recorded): no OTel MeterProvider — per-workspace cost metrics still DB-only
  (`provider_steps.cost_micros`); metrics pipeline queued behind the Gateway metering work (G-S3
  interlock) where cost numbers become billing-relevant.

## Verification state

- Full api suite (pretest guards + typecheck + units): see `evidence/gs1/test-run.txt` —
  regression set vs Phase-0 seal must be empty (failure-set diff at gate closure).
- Typecheck: 0 errors. Brand-lint: green. npm audit prod: 0 critical/0 high (unchanged).
- Upstream-file touches this slice (all additive/documented): `config/index.ts` (env vars),
  `access/actions.ts` (one action), `src/index.ts` (module registration), `better-auth.ts`
  (provider spread), `tasks/service.ts` + `chat/task-response.ts` (RBAC gate), `schema` untouched.

## Gate criteria ledger (handout §5 G-S1: "pilot org runs with SSO; audit export signed")

- Audit export produces a signed file: **MET** (verified transcript).
- SSO: code-complete + unit-verified; a real pilot-org login needs a staging IdP + deployed
  environment — **STAGING-PENDING** (needs the founder's GridFrames/K8s target or a compose
  staging with a test IdP; the mock-IdP integration test is the next increment).
- RBAC on the ledger: **MET** (first enforcement shipped; broader admin-console surface is
  the C-session's Governance Console work per the handout's team split).
- Helm/K8s + HA topology: **MET-in-code** (lint+render); cluster deploy rides G-S4 GridFrames.
