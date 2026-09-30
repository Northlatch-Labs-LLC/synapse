# Phase 0 dependency remediation — record (SYNAPSE-HANDOUT §4.3)

Baseline: upstream HEAD `651d39d9` (v0.28.0) · All work under npm 10.9.2 / node 22.13.1 (ADR-0001).
Oracle: full api suite (pretest guards + typecheck + unit) — INV-S1 zero capability change.

## Result

| Metric                                     | Baseline                                             | Post-remediation                    |
| ------------------------------------------ | ---------------------------------------------------- | ----------------------------------- |
| npm audit (prod) critical                  | 3                                                    | **0**                               |
| npm audit (prod) high                      | 24                                                   | **0**                               |
| api suite                                  | 3003 pass / 34 fail (33 platform-gated + 1 papercut) | see test-baseline.txt run 7         |
| Trivy api image CRITICAL/HIGH (fixed only) | 8 C / 135 H                                          | see trivy-api-image-remediated.json |

Remaining 15 audit findings are low/moderate, below the G-S0 bar; Renovate + the CI audit gate keep them visible and will land them as they get fixes.

## Direct dependency changes

**packages/api**: fastify ^4.28.0→^5.12.5 · @fastify/jwt ^8.0.0→^10.2.2 · @fastify/cookie ^9.4.0→^11.1.2 ·
@fastify/cors ^9.0.0→^11.3.0 · @fastify/multipart ^8.3.1→^10.1.2 · @fastify/rate-limit ^9.1.0→^11.2.0 ·
@fastify/websocket ^10.0.0→^11.3.1 · @fastify/otel ^0.20.1→^0.21.0 · undici ^5.29.0→^6.29.0 (fixed-in-major
6.x, not the audit-suggested 8.x: one major not three, and preserves dispatcher/global-fetch compatibility) ·
better-auth 1.6.13→1.7.6 (+@better-auth/expo 1.7.6) · ws ^8.20.0→^8.22.0 · sharp ^0.34.5→^0.35.4 ·
@larksuiteoapi/node-sdk ^1.59.0→^1.74.0 (bundles axios ≥1.16, closes the last transport high)

**packages/web-next + web-next-design**: next 16.1.6→16.3.6 · better-auth→1.7.6 · @tiptap/\* ^3.20.6→^3.31.3
(the 3.25/3.31 skew blocked all in-range audit fixes with ERESOLVE)

**packages/device-runtime**: tar 7.5.13→7.5.22 · picomatch 2.3.1→2.3.2 · ws 8.20.0→8.22.0 ·
chrome-devtools-mcp 0.7.0→1.10.1 (closes @modelcontextprotocol/sdk + puppeteer-core + @puppeteer/browsers + extract-zwt highs; browser capability kept — INV-S1)

**packages/remote-agent-daemon**: ws→8.22.0 · **packages/mobile-app** (outside root workspace): better-auth pins→1.7.6

**Root package.json**: overrides `@better-auth/core` 1.7.6, `axios ^1.16.0` (transitive security dedupe for
baileys/dingtalk-stream/@wecom transports), `zod 4.3.6` and `better-call 1.4.0` (flatten — prevents nested
copies under the Docker subset install that broke TS2742 portability); root dependency `axios ^1.16.0`
(deterministic root hoist — see incident 3).

## Upstream-file touches (documented, minimal)

1. `packages/api/src/index.ts` (1 line): fastify 5 types setErrorHandler's error as `unknown`; the handler's
   `error.message` read now uses the file's existing defensive-cast idiom. Behavior identical.
2. `packages/api/src/config/repo-paths.test.ts`: present-only guard on the never-committed
   `docs/device-runtime-v3.md` existence check, mirroring the file's own submodule pattern (papercut #2).
3. `infrastructure/Dockerfile.api`: DOCKER_CLI_VERSION 27.5.1→29.8.1 (Go stdlib CVE in the bundled docker
   CLI) + targeted `apt-get install libgnutls30` (2 OS criticals; blanket `apt-get upgrade` fails on
   bookworm-slim's missing bash man page — see comment in-file).
4. `docs/fk-policy.generated.md`: committed (deterministic regeneration; was untracked upstream, papercut #1).

## Incidents (recorded so nobody re-derives them)

1. **npm 12 lockfile churn** — installing with npm 12 rewrote dev-flags (148 lines). Reverted; ADR-0001 pins
   npm 10 for lockfile writes.
2. **ERESOLVE rollback corruption** — `npm audit fix` failing on the tiptap skew left the lock in a
   split-brain state: workspace dep entries updated, package entries stale. Symptom: `npm install` exits 0
   while installed versions stay old (`next` 16.1.6 with manifest 16.3.6). Cure: targeted `npm update <pkg>`
   - evicting the stale `lock.packages[...node_modules/<pkg>]` entries by hand, then reinstall.
3. **axios root-hoist loss** — the eviction dance dropped the root-hoisted axios; baileys (ESM) failed
   `ERR_MODULE_NOT_FOUND: axios`, breaking 12 IM-connector tests (run 6 regressions). npm refused to re-hoist
   a purely-transitive package. Cure: explicit root dependency `axios ^1.16.0` (deterministic hoist; same
   version the override mandates). Verified: connector suites green after.
4. **Docker subset-install TS2742** — the image's workspace-subset `npm ci` hoists differently than the full
   tree; better-auth 1.7.6's zod/better-call nested copies made the `auth` export type non-portable. Cure:
   root overrides pinning zod 4.3.6 / better-call 1.4.0 flat.

## What was deliberately NOT done

- No undici 8 (audit suggested; 6.29.0 is the fixed line with far smaller blast radius).
- No blanket `apt-get upgrade` in the image (breaks the build; targeted install instead; base-image refresh
  is the standing answer for OS drift, enforced by the CI Trivy gate).
- No test edits beyond the two documented papercut guards; the 33 platform-gated sandbox failures are
  environment-classified, covered by CI on Linux with bubblewrap.
