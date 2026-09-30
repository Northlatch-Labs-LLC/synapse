# SYNAPPSE — STATE OF THE SOLUTION

**Read this before doing anything.** It records what is shipped and verified, what is
blocked on the founder, and what is honestly not done — so no session repeats finished
work or claims credit for gaps that are known and open.

- **Live:** https://synappse.work (production, apex). Old `synapse.xlaunch.work` 301s page
  routes to the apex; `/api/v1` and `/ws` are exempt (the Stripe webhook still delivers there by design).
- **Trunk:** `main` only, all branches deleted by founder. Code HEAD: `df939efa` (2026-09-30); this doc updated same day (ops round: spin capture, prune rule, blips).
- **Brand:** user-facing mark is **Synappse** (double-p). Internal identifiers stay `synapse`
  (`@synapse/*` packages, `SYNAPSE_*` env, `synapse://` scheme, repo name) — do not "fix" them.
- **Adjacent programs (separate state, separate repos):** Latch (desktop/CLI/mobile harness,
  `latch` repo) and the Orchestrator are NOT covered by this file.

---

## 1. Production topology

| Thing                 | Value                                                                                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GridFrames team       | "Synapse" under ops@northlatch.dev; project "Synapse"                                                                                                                                                                                                             |
| Platform service uuid | `1jrsnyfksvyfkivawvyhej4x`                                                                                                                                                                                                                                        |
| VM                    | Incus `gf-30-synapse`, 10.28.242.100 (4cpu/8GB/40GB), from gf-host: `sudo incus exec gf-30-synapse -- …`                                                                                                                                                          |
| Containers on VM      | `api web postgres redis embed tesseract docextract` + `web-public` forwarder :30080                                                                                                                                                                               |
| Edge                  | gf-host Traefik file-provider: `/data/xlaunch/proxy/dynamic/synappse-apex.yml` (apex+www, LE) + `synapse-old-redirect.yml` (301, API/ws exempt)                                                                                                                   |
| Access                | `ssh gf-host` (ubuntu); docker and `/data/synapse/.env` require **sudo** there                                                                                                                                                                                    |
| DB                    | `docker exec postgres-1jrsnyfksvyfkivawvyhej4x psql -U synapse -d synapse -c "…"` on the VM (use `-c`, never stdin heredocs)                                                                                                                                      |
| Secrets/cards         | gf-host `/data/synapse/.env` (Stripe, gateway key, base URLs), `FOUNDER-CREDENTIALS.txt` (0600)                                                                                                                                                                   |
| Backups               | nightly 03:17Z `pg_dump.gz` → gf-host `/data/backups/synapse`, 7d retention; restore drill passed 2026-09-29                                                                                                                                                      |
| Monitoring            | gf-host `/data/synapse/monitor.sh`, cron \*/5 → log `/data/backups/synapse/metrics.log`; flags in `/data/backups/synapse/FLAGS/` (`alerts.log` + sentinel file `ATTENTION-REQUIRED`); auto-forensics on api CPU > 80% → `FLAGS/spin-HHMM.log` (throttled 1/30min) |

## 2. DONE — shipped and verified (do not redo)

1. **Platform install + cutover to the team container.** Founder data migrated; edge routes
   to the VM; old gf-host stack kept only as rollback (see HANDOFF on gf-host). Verified by
   routed health + public screenshots.
2. **In-app Stripe billing.** Free / Pro $25 / Team $25-seat; checkout, portal, signed webhook
   (`we_1UL5zQAGlri04kDxhVWORhhE`, delivered to the OLD domain URL on purpose); plan flip proven
   end-to-end in **test mode**. Pricing on the landing matches Stripe.
3. **West-first login.** WhatsApp OTP panel is the default sign-in (email+password also works).
   Chinese providers removed from API + UI (IM cards flag-gated, `IM_WESTERN_ONLY` default true).
   **The OTP does not actually send yet — see §4.**
4. **Brand = Synappse everywhere user-facing.** Sweep 1 (7c6361d7): titles, auth shell,
   login/signup, sidebar, IM copy, alts, mobile strings, publisher "Synappse Official".
   Sweep 2 (df939efa): the dashboard Home hero (`APP_NAME` in `packages/shared/src/constants/index.ts`)
   and the Command Secretary actor defaults (English-only, `packages/shared/src/actor/index.ts`).
   Verified by artifact greps (11 web chunks carry Synappse, 0 CJK, 0 old brand in dashboard
   bundles) **and** a playwright screenshot of the Home headline.
5. **English-only surface, verified in the production DB.** Workspace actor instances, active
   skills metadata+bodies, installed skills: 0 CJK. The two China-market skills
   (feishu-drive, a-stock-analysis) are **deactivated, not deleted**; the marketplace list also
   filters `is_active`.
6. **z.ai provider working.** GLM-5.3-Flash via a worker model binding: `provider_kind =
openai_compatible`, base `https://api.z.ai/api/coding/paas/v4` (coding-plan key — the
   standard surface 429s). Verified E2E (an actor replied through GLM).
7. **Archive conversations.** Per-member flag in `workspace_member_conversation_views`
   (NOT a column on conversations). Sidebar toggle + hover action + Archived filter.
   Round-trip verified on prod. Messages themselves are immutable by design — no delete.
8. **Landing modernization Phase 0 + dark-mode fix + legal stack.** Header Sign in link,
   Pricing section/nav, `?next=` alias on /login; landing force-wrapped `.light` with a
   2.5s fail-safe against whileInView stranding content at opacity 0 (dark-mode ghost text
   root-caused and fixed); `/privacy` (GDPR anchor), `/terms`, `/cookies` + 4-column footer.
9. **UX fixes shipped:** home-composer first-message handoff via sessionStorage (the typed
   first message no longer dies on navigation); hero headline cannot clip (`width: max-content`);
   second hero CTA solid secondary; error notice English (`出错了` removed).
10. **Platform admin fixes:** super_admin/model_admin can edit seeded platform model groups;
    prod seed guarded (full `db:seed` must NEVER run on prod — it would open a demo super_admin).
11. **Ops & repo hygiene:** deploy overlay versioned in-repo (`infrastructure/gridframes/`),
    monitoring + forensics (§1), nightly backups + drill, readmes de-upstreamed (Northlatch
    banner, live link, 0 zai-org refs), GitHub description/homepage updated, main-only trunk,
    zero open PRs.

## 3. How to deploy (the rule — deviations have caused every "it's not there" incident)

```
local → rsync -aR <changed files> gf-host:/tmp/… → sudo cp into /data/synapse/source
gf-host (sudo): docker compose --env-file /data/synapse/.env -f docker-compose.gridframes.yml \
                  build --no-cache api web
verify IN ARTIFACT (docker run --entrypoint sh … grep)  ← never skip
gf-host (sudo): docker push localhost:5000/northlatch/synapse-{api,web}:0.28.0-gf1
VM:  cd /data/xlaunch/services/1jrsnyfksvyfkivawvyhej4x && docker compose pull api web \
     && docker compose up -d api web
verify PUBLIC (curl health + playwright screenshot of the real page)
```

- `compose build` does NOT push; the platform's own restart reuses cached images. Registry
  forwarder 10.28.242.1:5000 + its ufw rule must stay.
- `NEXT_PUBLIC_*` and `APP_NAME` are **build-time** — runtime env rows cannot change them.
- Compose **literals override platform env rows** (`AUTH_TRUSTED_ORIGINS: ${APP_BASE_URL},synapse://`).
- The model-binding resolver caches → restart api after direct `model_bindings` edits.
- Full-page screenshots need a scroll-through pass first (whileInView renders blank otherwise);
  Cloudflare 1010 blocks python-urllib (use curl or a real browser UA).
- After the VM `pull`, run `docker image prune -f` on the VM: a `--no-cache` rebuild orphans
  the previous image layers (~7.6GB; on 2026-09-30 the disk went 29%→48% until pruned).
- **Never fix a visual bug without screenshotting prod and reading the image.**

## 4. Founder-dependent (waiting on founder input, not on engineering)

1. **WhatsApp OTP delivery.** Code is live but nothing sends until the founder provides a
   Meta WhatsApp Business token + phone number ID and approves the `synapse_otp` template.
2. **Stripe live flip.** Test keys until the founder is ready to charge. At flip: swap live
   keys in service env AND register a webhook endpoint at the apex URL (keep the old one
   during transition).
3. **Alert delivery channel.** Monitor flags only land in metrics.log; founder hasn't picked
   email/push. Unmonitored by choice so far: Redis internals, cert expiry, gf-host health.
4. **Legal counsel review** of Privacy/Terms before scaling customers (text is a professional
   template, not lawyer-reviewed).
5. **Rotate the founder password** and shred `FOUNDER-CREDENTIALS.txt` (the card itself says so).

## 5. Honestly NOT done (known gaps — do not claim these as done)

1. **API CPU spin — ROOT-CAUSED (founder + telemetry), remediated by config.** During the
   09-29 evening → 09-30 ~04:00Z window, actor turns ran on the Northlatch Gateway group whose
   priority-0 binding is `auto` on gateway.xlaunch.work/v1 — the gateway light/test model
   (founder: auto is for very light tasks and testing only). `provider_steps` telemetry proves
   it: 72/6/11 auto steps the 09-29 20:00–22:00Z hours, then 44+7 in the 03:00–04:00Z window,
   step latencies 10–44s; ZERO auto steps after the founder moved all 6 actor assignments (and
   the workspace default) to Z.ai_coding_plan (GLM-5.3-Flash; binding later set to glm-5.1).
   The 05:10Z capture's actor ping-pong (`send_to` loops, "rethinking", ballooning latencies)
   was that degraded-model behavior, not an api code bug. No recurrence since the move;
   forensics stays armed. RESIDUAL CLOSED 2026-09-30 ~20:30Z (lead decision, founder
   ratified "auto is for very light tasks/testing only"): the platform default group's `auto`
   binding is DISABLED (`is_enabled=false` on 'Auto (gateway-routed)', platform scope); fusion
   (the gateway ensemble) now resolves first for any workspace without an explicit assignment.
   api restarted to bust the binding-resolver cache; health green. Re-enable = flip the flag
   back + restart api.
2. **Mobile app: code done + STAGED on Android emulator (Expo Go, prod API), still no APK.**
   West-first sweep on main (03372423) + a startup-crash fix (fedf3381: Hermes has no
   globalThis.crypto — all shared UUID call sites now go through createUuid). Staged and
   screenshot-verified 2026-09-30: emulator Pixel_9_API_36 + Expo Go 54.0.8 + Metro
   (`packages/mobile-app`, `.env` EXPO_PUBLIC_API_URL=https://synappse.work/api/v1, git-
   ignored) — login screen renders English-only, no Feishu button. Still NOT a signed build:
   no APK/IPA exists, never present as shipped. (This Mac has no JDK: no native debug build.)
3. ~~Actor seed catalog bilingual~~ — DONE on main (0625b6a6): `BilingualCopy` removed at the
   type level, 21 seed files English-only. Inert on prod (db:seed never runs there); repo now
   clean of CJK in the seed catalog.
4. ~~Member-cap enforcement at invite redemption~~ — IMPLEMENTED (ec6781ed) **and DEPLOYED
   to prod 2026-09-30 ~20:00Z** (founder go). Both membership paths (redeem + admin direct
   add) lock the workspace row FOR UPDATE and enforce the plan cap in-transaction (free=3,
   pro=10, team=purchased seat_quantity → 402 `plan_limit_reached`); 14 unit tests pass;
   deploy followed the full rule (artifact grep, push, VM pull+up+prune, public health green).
   Pre-existing suite note: 8 api tests fail on the pristine tree too (5 need outbound
   network, 3 IM transport-schema tests date from the west-first enum narrowing) — not ours.
5. **`main` has no branch protection.** Main-only trunk by founder choice; flagged, unprotected.
6. **Frontend spec phases 2–3 not approved/started:** type-scale tokens, login state-matrix
   polish, pricing FAQ/table, `?next=` on signup. Phase 0 (shipped, see §2.8) was approved by
   takeover; the rest await an explicit go.
7. **Two China skills deactivated, not deleted** (feishu-drive, a-stock-analysis bodies remain
   in DB, `is_active=false`).
8. **gf-host `HANDOFF.md` / `FOUNDER-CREDENTIALS.txt` still reference the old domain** in places;
   this file is the authoritative state doc.
9. **Transient health blips.** Single-sample health-DOWN at 05:30Z and 07:35Z on 09-30 (plus
   three the evening of 09-29), each self-recovered within one 5-min cycle; only the 05:30 one
   correlates with the spin window. Left alone while health stays green.

## 6. Verified-false leads (do not re-chase)

- Headline truncation was NEVER CSS on the rotating word — it was a font-probe-measured slot
  width (205px box vs 263px render). `width: max-content` fixed it by construction. Never trust
  probe-measured px for a rendering slot.
- The apex 403 INVALID_ORIGIN was better-auth `trustedOrigins`, not DNS/TLS/proxy.
- z.ai 404s were the `/v1` suffix appended to `/paas/v4` under `provider_kind='openai'` —
  not a bad key. `出错了` was a hardcoded string, not a model failure.
- The archive 500 was writing `archived` to `conversations` (column doesn't exist) instead of
  the per-member views table.
- "Billing missing" incidents were build-cache/push-pipeline issues, never missing code.
- The CPU spin was never an api scheduler/code bug: actors were bound to the gateway `auto`
  model (test-grade), whose looping produced the ping-pong. Founder moved actors to Z.ai —
  closed. Don't hunt the think pipeline for this.
- Repo-wide `oxlint` fails on a pristine tree (pre-existing upstream breakage) — not ours.

---

_Maintained by the Synapse lead session. Update this file (and commit) whenever state changes;
the next session's first read is this file._
