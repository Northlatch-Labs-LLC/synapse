# Synapse local boot — end to end, 2026-09-27

Evidence note from the 2026-09-27 end-to-end boot of this checkout (committed
2026-09-28 during the devop close-out). Stack brought up with two fixes applied:

1. **Fastify 5 logger fix** (committed c228a8c4, pushed to phase1/spine):
   `packages/api/src/index.ts` passes the pino instance as `loggerInstance`;
   under `logger` Fastify 5.12.5 throws FST_ERR_LOG_INVALID_LOGGER_CONFIG.
   This was the sole API boot blocker.
2. **Fresh database needs bootstrap**: `npm run db:bootstrap` applies the
   current access-model schema (the API's preflight refuses to serve on an
   outdated/empty schema — it names the missing tables).

## Running stack

| component              | command / location                                                                                                                      | state           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| postgres 16 + pgvector | docker `synapse-pg`, host 5433                                                                                                          | Up              |
| redis 7                | docker `synapse-redis`, host 6380                                                                                                       | Up              |
| API                    | `npm run dev -w packages/api` with `DATABASE_URL=postgresql://synapse:password@localhost:5433/synapse REDIS_URL=redis://localhost:6380` | listening :3001 |
| Web (Next.js 16.3.6)   | `npm run dev:web`                                                                                                                       | listening :3000 |

## Verification

- `curl http://127.0.0.1:3001/api/v1/health` →
  `{"status":"healthy","services":{"database":true,"databaseSchema":true,"redis":true,...}}`
- `curl http://localhost:3000/` → HTTP 200, full SSR page
  (title 把 AI 组织成团队)
- `curl http://localhost:3000/api/v1/health` → healthy (web proxy → API → DB)
