# ADR-0001: Pin npm 10 for all lockfile-writing operations

- Status: accepted (Phase 0, G-S0)
- Date: 2026-09-27
- Deciders: S-A session lead (synapse-phase0 mission)
- Scope: developer toolchain, CI

## Context

Upstream CI builds with Node 22 (bundled npm 10, see `.github/workflows/verify-boundary.yml`);
the Docker images use Node 20. The local dev machine that performed the Phase-0 baseline runs
Node 26 with npm 12.0.2. During baseline install, npm 12 rewrote `package-lock.json` with its own
dev-flag semantics (148 changed lines, pure format churn: `"dev": true` markers dropped/moved on
optional platform packages) with zero dependency-intent change. npm 12 also enables new
supply-chain gates (`allow-remote=none`, `allow-git=none`) that block two legitimate upstream
dependency forms — the `xlsx` CDN tarball and the `libsignal` git dependency (WhatsApp transport;
INV-S1 keeps it).

## Decision

1. All commands that write `package-lock.json` (`npm install`, `npm update`, `npm audit fix`,
   dependency bumps) run under **npm 10**, matching CI: `npx -p npm@10 npm <cmd>`. This keeps the
   lockfile format stable and identical to what CI resolves.
2. npm 12 remains usable for read-only operations (`npm audit`, `npm ls`, running scripts) —
   it must not touch the lockfile.
3. Local installs on npm≥11 additionally need `--allow-remote=cdn.sheetjs.com`-style escapes
   (or `=all`) and `--allow-git=all` plus an ssh→https `insteadOf` when no GitHub SSH key is
   present; these flags are install-host concerns, not repo state.
4. CI keeps Node 22/npm 10 in `ci.yml`; when CI's Node is upgraded, this ADR is revisited so the
   lockfile format migrates deliberately, not as CI noise.

## Consequences

- No mixed-format lockfile churn between contributors and CI.
- The `xlsx`/`libsignal` dependency forms stay pinned in the lockfile (upstream fidelity, INV-S1)
  rather than being rewritten to registry mirrors.
- Devs on very new Node must remember the pin; the guard is review (lockfile diffs that are pure
  format churn get rejected) plus this ADR as the recorded reason.
