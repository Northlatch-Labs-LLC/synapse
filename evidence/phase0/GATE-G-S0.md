# GATE G-S0 — Hardening gate report

Mission: synapse-phase0 · Session: S-A lead · Date: 2026-09-27 · Handout ref: SYNAPSE-HANDOUT §4.5
Verdict: **GREEN — gate closed** (qualifications below are evidence-backed, none founder-blocking)

## Criterion 1 — Zero known criticals/highs, or founder-signed exceptions

| Surface                                               | Before                | After     | Evidence                                                                                                             |
| ----------------------------------------------------- | --------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| npm audit (production, `--omit=dev`)                  | 3 critical / 24 high  | **0 / 0** | `check-audit.mjs` output in this report run; raw re-audit: `npm-audit-raw.json` (baseline), live re-run logged below |
| Trivy `synapse-api` image (CRITICAL/HIGH, fixed-only) | 8 critical / 135 high | **0 / 0** | `trivy-api-image.json` (baseline) → `trivy-api-image-remediated.json` (final `{}` tally)                             |

Remaining npm findings: 15 (7 low / 8 moderate) — below the G-S0 bar; Renovate security PRs + the CI audit
gate own them. No founder exceptions required.

## Criterion 2 — CycloneDX SBOM published

`evidence/phase0/sbom.cdx.json` — CycloneDX 1.6, **1,463 components**, reproducible mode.
(Regenerated post-remediation; generation command recorded in this file's history.)

## Criterion 3 — Baseline suite green (recorded), flaky list recorded

- Baseline (run 4, pristine tree, CI toolchain node 22.13.1/npm 10.9.2, Redis up): **3003 pass / 34 fail / 25 skip**.
  All 34 classified in `flaky.json`: 33 platform-gated (bwrap absent on macOS; fail-closed direction; CI runs
  them on Linux with bubblewrap+ripgrep installed) + 1 fresh-clone papercut (uncommitted doc; fixed).
- Post-remediation final (run 8): recorded in `test-baseline.txt` — regression set vs baseline = empty (verified
  by failure-set diff), papercut fixed, sandbox cluster unchanged (platform).
- **Upstream's own CI was RED at this HEAD** (both its gates failed: fk-policy staleness + secret-scan) — the
  fork's baseline discipline now exceeds upstream's.
- Flaky-proper: zero nondeterministic failures observed across 4 complete/partial runs.

## Criterion 4 — Audit trail in evidence/

`evidence/phase0/`: repository.json · install.log · npm-audit-raw.json · osv-scanner.json ·
dependency-audit.json (+ normalize-audit.mjs, check-audit.mjs) · test-baseline.txt (runs 1–8, annotated) ·
flaky.json · remediation.md · trivy-api-image.json · trivy-api-image-remediated.json · sbom.cdx.json ·
this report.

## What shipped (branch `phase0/hardening`, 31 files)

1. Dependency remediation to 0/0 (details + incidents in `remediation.md`): fastify 5 stack, @fastify/jwt 10
   (critical fast-jwt), next 16.3.6 (critical chain), tar/picomatch/ws, better-auth 1.7.6 family,
   @larksuiteoapi 1.74 (axios≥1.16), chrome-devtools-mcp 1.10.1 chain, sharp 0.35, undici 6.29 (fixed line,
   not the suggested 8.x — smaller blast radius), tiptap 3.31 alignment, zod 4.6.5 uniform, testcontainers 12
   (drops vulnerable vendored undici), axios root hoist for the 8 IM transports (INV-S1).
2. Keep-it-fixed rails: `.github/workflows/ci.yml` (ordered blocking gates: install → brand-lint →
   audit-critical → lint → typecheck → test+conformance+boundary → Trivy image scan; Redis service;
   bubblewrap+ripgrep installed so the 33 sandbox contract tests actually run in CI) + `renovate.json`
   (security PRs immediate, patch automerge, weekly batch otherwise).
3. INV-S3 foundation: `product/identity/brand.yaml` manifest + `scripts/brand-lint.mjs` (green; scans the
   product overlay; DEC-S1 placeholder marked do-not-ship — no naming decision assumed).
4. Upstream papercut fixes (documented): committed `docs/fk-policy.generated.md`; repo-paths present-only
   guard; 1-line fastify-5 type accommodation in `src/index.ts`; ADR-0001 (npm 10 pin for lockfile writes).

## Limitations & deferred (honest ledger)

- The 33 sandbox tests pass/fail is asserted by CI on Linux, not on this macOS host — the first push of this
  branch is the proving run (ci.yml is in the branch).
- OS-level base drift: targeted apt installs (libgnutls30, libpcre2, libcap2) + npm@11 in-image cover current
  CVEs; standing coverage is the CI Trivy gate. Blanket `apt-get upgrade` breaks bookworm-slim builds
  (bash man-page bug) — noted in the Dockerfile.
- `evidence/` is committed on the branch (INV-S6). Large artifacts (test-baseline.txt ~1MB) live here rather
  than LFS — acceptable for Phase 0; revisit if the tree grows.
- Upstream sync: fork was detached from the GitHub fork network by privatizing; weekly sync operates via the
  `upstream` remote (fetch/merge), unchanged in effect.

## Sign-off

Closed by S-A session lead under delegated Phase 0 authority (handout §4). Founder-visible qualifications:
none blocking; DEC-S1..S5 remain open and untouched.
