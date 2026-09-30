#!/bin/sh
# GridFrames deploy driver — run ON gf-host from /data/synapse/source.
# Idempotent: re-running refreshes images and restarts the stack (rollback =
# previous image tag + `docker compose down`, volumes persist).
set -eu

cd /data/synapse/source

ENV_FILE=/data/synapse/.env
if [ ! -f "$ENV_FILE" ]; then
  echo "generating $ENV_FILE (secrets via openssl; file written 0600)"
  umask 077
  PG_PASS=$(openssl rand -hex 24)
  RD_PASS=$(openssl rand -hex 24)
  APP_SECRET=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  AUTH_SECRET=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  AUDIT_KEY=$(openssl genpkey -algorithm Ed25519 2>/dev/null | openssl pkcs8 -topk8 -nocrypt -outform DER 2>/dev/null | base64 -w0)
  PUBLIC_URL="https://synapse.xlaunch.work"
  cat > "$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$PG_PASS
REDIS_PASSWORD=$RD_PASS
APP_SECRET=$APP_SECRET
BETTER_AUTH_SECRET=$AUTH_SECRET
AUDIT_EXPORT_SIGNING_KEY=$AUDIT_KEY
APP_BASE_URL=$PUBLIC_URL
BASE_URL=$PUBLIC_URL
AUTH_TRUSTED_ORIGINS=$PUBLIC_URL,synapse://
NEXT_PUBLIC_APP_URL=$PUBLIC_URL
NEXT_PUBLIC_SITE_URL=$PUBLIC_URL
NEXT_PUBLIC_WS_URL=wss://synapse.xlaunch.work
EXPO_PUBLIC_API_URL=$PUBLIC_URL/api/v1
PLATFORM_ADMIN_EMAILS=ops@northlatch.com,ops@northlatch.dev
EOF
  chmod 600 "$ENV_FILE"
fi

echo "building images (api, web, tesseract-ocr, docextract, embed)"
docker compose --env-file /data/synapse/.env -f docker-compose.gridframes.yml build

echo "starting data stores"
docker compose --env-file /data/synapse/.env -f docker-compose.gridframes.yml up -d postgres redis

echo "waiting for postgres + redis health"
docker compose --env-file /data/synapse/.env -f docker-compose.gridframes.yml up -d --wait postgres redis

echo "starting api + web + sidecars"
docker compose --env-file /data/synapse/.env -f docker-compose.gridframes.yml up -d --wait api web tesseract-ocr docextract embed

echo "applying database schema (db:bootstrap:runtime)"
docker compose --env-file /data/synapse/.env -f docker-compose.gridframes.yml run --rm api \
  npm run db:bootstrap:runtime -w packages/api

echo "seeding production catalogs (actors, skills, mcp plugins)"
docker compose --env-file /data/synapse/.env -f docker-compose.gridframes.yml run --rm \
  -v /data/synapse/seed-prod.mts:/app/seed-prod.mts:ro \
  -v /data/synapse/source/.setup:/app/.setup:ro \
  api sh -c "./node_modules/.bin/tsx /app/seed-prod.mts" \
  || echo "prod seed skipped (already seeded?)"

echo "normalizing catalogs to English (idempotent)"
docker compose --env-file /data/synapse/.env -f docker-compose.gridframes.yml run --rm \
  -v /data/synapse/normalize-english.mts:/app/normalize-english.mts:ro \
  api sh -c "./node_modules/.bin/tsx /app/normalize-english.mts" \
  || echo "english normalize skipped (non-fatal)"

if grep -q "^SYNAPSE_GATEWAY_API_KEY=" /data/synapse/.env 2>/dev/null; then
  echo "seeding model groups (Northlatch Gateway)"
  docker compose --env-file /data/synapse/.env -f docker-compose.gridframes.yml run --rm \
    api npm run db:seed:model-groups -w packages/api \
    || echo "model-groups seed skipped"
else
  echo "SYNAPSE_GATEWAY_API_KEY not set - skipping model groups seed"
fi

echo "stack up. health:"
docker compose --env-file /data/synapse/.env -f docker-compose.gridframes.yml ps
curl -fsS -m 20 https://synapse.xlaunch.work/api/v1/health >/dev/null 2>&1 \
  && echo "api health (routed, TLS): OK" \
  || echo "api health (routed): not ready yet — check docker logs synapse-api + traefik xlaunch-proxy"
