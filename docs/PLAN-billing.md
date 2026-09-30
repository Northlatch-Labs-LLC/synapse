# PLAN — Synapse In-App Billing (Option B)

Working contract. Status marks: ⬜ todo · 🔄 in progress · ✅ done. Append-only progress log at the bottom. Status reports read from this file.

**Founder decision FR-B1 (2026-09-29):** in-app Stripe subscriptions (Option B) over platform-layer billing.
**Prices (FR-pending, adjustable later in Stripe without code changes):**

- Free — $0: 1 workspace, 3 agents, 3 members, gateway Auto models
- Pro — $25/month per workspace: 10 agents, 10 members, all models
- Team — $25/seat/month (min 3 seats): unlimited agents, seats as purchased, all models

**Mode:** Stripe TEST keys first (org account, already in use by GridFrames). Live keys = founder flip when ready to charge real money.
**Stripe objects (test):** Pro `price_1UL5O8AGlri04kDx7uXbhgXm` · Team `price_1UL5OIAGlri04kDx0UEOdfug`.

## Steps

1. ⬜ **API billing module** (`packages/api/src/modules/billing/`, zero new dependencies — Stripe REST via fetch, webhook signature via node:crypto HMAC):
   - `GET /api/v1/workspaces/:id/billing/plans` — tier cards + current plan
   - `GET /api/v1/workspaces/:id/billing/subscription` — plan, status, period, seats, usage counts
   - `POST /api/v1/workspaces/:id/billing/checkout` — owner/admin only → Stripe Checkout URL
   - `POST /api/v1/workspaces/:id/billing/portal` — owner/admin only → Stripe portal URL (cancel/upgrade/card)
   - `POST /api/v1/billing/webhook` — **no session auth** (Stripe signature is the credential — the pairing-redeem lesson), handles checkout.session.completed + customer.subscription.updated/deleted
2. ⬜ **Schema:** `workspace_subscriptions` table. EC-B1: this codebase has NO in-place migration tooling (version = slug + schema hash; edits demand db:rebuild) — so: identical DDL added to schema.sql AND applied idempotently to prod by hand, then the new schema_migrations version row is upserted on prod. DDL must stay byte-identical between the two.
3. ⬜ **Zod contracts** in `@synapse/shared` (the behavior oracle) + unit tests.
4. ⬜ **Web UI:** `app/dashboard/settings/billing/` — plan cards, current plan badge, upgrade → checkout redirect, manage billing → portal.
5. ⬜ **Tier enforcement:** member invites + actor installs capped per plan (402-style error + upgrade prompt). Message metering is display-only in v1 — the gateway meters inference cost already.
6. ⬜ **CI green → PR → merge → build → deploy → LIVE PROOF:** test-mode checkout with card 4242… → webhook flips the workspace to Pro → verify via API. Then evidence pack.

Out of scope v1: metered usage billing, invoice UI, proration UX, taxes, multi-currency.

## Progress log

- 2026-09-29: plan written after FR-B1. Stripe test products/prices created (Pro flat, Team per-seat licensed).
