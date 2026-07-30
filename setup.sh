#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")" && pwd)/.env"
WEB_ENV_FILE="$(cd "$(dirname "$0")" && pwd)/packages/web-next/.env.local"
MOBILE_ENV_FILE="$(cd "$(dirname "$0")" && pwd)/packages/mobile-app/.env"

read_env_value() {
  local key="$1"
  if [ -f "$ENV_FILE" ]; then
    sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1
  fi
}

host_from_url() {
  local value="$1"
  value="${value#http://}"
  value="${value#https://}"
  value="${value%%/*}"
  value="${value%%:*}"
  printf '%s' "$value"
}

scheme_from_url() {
  local value="$1"
  case "$value" in
    http://*) printf 'http' ;;
    https://*) printf 'https' ;;
    *) printf '' ;;
  esac
}

url_for_public_endpoint() {
  local scheme="$1"
  local host="$2"
  local port="$3"

  local default_port=""
  case "$scheme" in
    http) default_port="80" ;;
    https) default_port="443" ;;
  esac

  if [ -n "$port" ] && [ "$port" != "$default_port" ]; then
    printf '%s://%s:%s' "$scheme" "$host" "$port"
    return
  fi

  printf '%s://%s' "$scheme" "$host"
}

existing_public_domain="$(read_env_value SYNAPSE_PUBLIC_DOMAIN)"
existing_public_host="$(read_env_value SYNAPSE_PUBLIC_HOST)"
existing_http_port="$(read_env_value SYNAPSE_HTTP_PORT)"
existing_deploy_mode="$(read_env_value SYNAPSE_DEPLOY_MODE)"
existing_app_base_url="$(read_env_value APP_BASE_URL)"
existing_app_base_host="$(host_from_url "$existing_app_base_url")"
existing_app_base_scheme="$(scheme_from_url "$existing_app_base_url")"

DEPLOY_MODE="${SYNAPSE_DEPLOY_MODE:-${existing_deploy_mode:-}}"
if [ -z "$DEPLOY_MODE" ]; then
  if [ "$existing_app_base_scheme" = "http" ]; then
    DEPLOY_MODE="http"
  else
    DEPLOY_MODE="tls"
  fi
fi

case "$DEPLOY_MODE" in
  tls|selfsigned|http) ;;
  *)
    echo "Unsupported SYNAPSE_DEPLOY_MODE: $DEPLOY_MODE" >&2
    echo "Use SYNAPSE_DEPLOY_MODE=tls, SYNAPSE_DEPLOY_MODE=selfsigned, or SYNAPSE_DEPLOY_MODE=http." >&2
    exit 1
    ;;
esac

DOMAIN="${SYNAPSE_PUBLIC_DOMAIN:-${existing_public_domain:-${existing_app_base_host:-change-me.example.com}}}"
PUBLIC_HOST="${SYNAPSE_PUBLIC_HOST:-${existing_public_host:-${existing_app_base_host:-$DOMAIN}}}"
HTTP_PORT="${SYNAPSE_HTTP_PORT:-${existing_http_port:-80}}"
# External TLS port (tls + selfsigned modes). The compose mapping publishes it;
# render-edge-config.sh folds it into redirects + Alt-Svc when it isn't 443.
TLS_PORT="${SYNAPSE_TLS_PORT:-$(read_env_value SYNAPSE_TLS_PORT)}"
TLS_PORT="${TLS_PORT:-443}"
# Host port for the plain-http listener of the TLS edge (redirect + ACME). NB:
# Let's Encrypt HTTP-01 always validates against PUBLIC port 80 — remapping
# this only helps behind an external 80→port forward.
TLS_ACME_PORT="${SYNAPSE_TLS_ACME_PORT:-$(read_env_value SYNAPSE_TLS_ACME_PORT)}"
TLS_ACME_PORT="${TLS_ACME_PORT:-80}"
# Stored (.env) values, scrubbed of legacy fabrication BEFORE the explicit-env
# override merge. Pre-single-domain setup.sh fabricated {www,m,mobile,npmr}.<host>
# "subdomains" plus LETSENCRYPT junk into EVERY http-mode .env; keyed on the
# STORED mode (only legacy http .envs ever contained fabricated values — in a
# tls .env, www.<domain> is an operator-configured subdomain and must survive),
# so the classic "got a real domain, upgrade to tls" re-run doesn't feed
# www.<ip>/npmr.<ip> straight into certbot's -d list.
stored_www="$(read_env_value SYNAPSE_WWW_DOMAIN)"
stored_mobile_short="$(read_env_value SYNAPSE_MOBILE_SHORT_DOMAIN)"
stored_mobile="$(read_env_value SYNAPSE_MOBILE_DOMAIN)"
stored_registry_domain="$(read_env_value SYNAPSE_REGISTRY_DOMAIN)"
stored_cert_name="$(read_env_value LETSENCRYPT_CERT_NAME)"
stored_email="$(read_env_value LETSENCRYPT_EMAIL)"
if [ "${existing_deploy_mode:-}" = "http" ] && [ -n "$existing_public_host" ]; then
  if [ "$stored_www" = "www.$existing_public_host" ]; then stored_www=""; fi
  if [ "$stored_mobile_short" = "m.$existing_public_host" ]; then stored_mobile_short=""; fi
  if [ "$stored_mobile" = "mobile.$existing_public_host" ]; then stored_mobile=""; fi
  if [ "$stored_registry_domain" = "npmr.$existing_public_host" ]; then stored_registry_domain=""; fi
  if [ "$stored_cert_name" = "$existing_public_host" ]; then stored_cert_name=""; fi
  if [ "$stored_email" = "admin@$existing_public_host" ]; then stored_email=""; fi
fi
# Cert name/email that match the previously DERIVED shape re-derive in every
# mode (so a domain change moves the lineage name with it); custom values
# never match and are preserved. Idempotent when nothing changed.
if [ -n "${existing_public_domain:-}" ]; then
  if [ "$stored_cert_name" = "$existing_public_domain" ]; then stored_cert_name=""; fi
  if [ "$stored_email" = "admin@$existing_public_domain" ]; then stored_email=""; fi
fi
# `${VAR-...}` (not `:-`): an explicitly EMPTY env var must be able to clear a
# stored subdomain (`SYNAPSE_WWW_DOMAIN= ./setup.sh`), matching the
# EXPO_PUBLIC_AUTH_ORIGIN convention below.
WWW_DOMAIN="${SYNAPSE_WWW_DOMAIN-$stored_www}"
MOBILE_SHORT_DOMAIN="${SYNAPSE_MOBILE_SHORT_DOMAIN-$stored_mobile_short}"
MOBILE_DOMAIN="${SYNAPSE_MOBILE_DOMAIN-$stored_mobile}"
REGISTRY_DOMAIN="${SYNAPSE_REGISTRY_DOMAIN-$stored_registry_domain}"
# Host port verdaccio is published on when no registry subdomain is configured.
# VERDACCIO_PORT is the pre-rename spelling — migrate an existing override so a
# re-run doesn't silently move a custom-port registry back to 4873. The stored
# value is kept separately: the registry-URL scrub below needs the OLD port to
# recognize a previously self-derived URL.
stored_registry_port="$(read_env_value SYNAPSE_REGISTRY_PORT)"
stored_registry_port="${stored_registry_port:-$(read_env_value VERDACCIO_PORT)}"
stored_registry_port="${stored_registry_port:-4873}"
REGISTRY_PORT="${SYNAPSE_REGISTRY_PORT:-$stored_registry_port}"
LETSENCRYPT_CERT_NAME_VALUE="${LETSENCRYPT_CERT_NAME:-$stored_cert_name}"
LETSENCRYPT_EMAIL_VALUE="${LETSENCRYPT_EMAIL:-$stored_email}"

case "$DEPLOY_MODE" in
  http)
    DOMAIN="${SYNAPSE_PUBLIC_DOMAIN:-${existing_public_domain:-$PUBLIC_HOST}}"
    PUBLIC_SCHEME="http"
    WS_SCHEME="ws"
    APP_URL="$(url_for_public_endpoint "$PUBLIC_SCHEME" "$PUBLIC_HOST" "$HTTP_PORT")"
    ;;
  selfsigned)
    # Self-signed HTTPS on an IP or hostname: same host semantics as http mode
    # (SYNAPSE_PUBLIC_HOST is authoritative), but https URLs + the TLS edge.
    DOMAIN="${SYNAPSE_PUBLIC_DOMAIN:-${existing_public_domain:-$PUBLIC_HOST}}"
    PUBLIC_SCHEME="https"
    WS_SCHEME="wss"
    APP_URL="$(url_for_public_endpoint "$PUBLIC_SCHEME" "$PUBLIC_HOST" "$TLS_PORT")"
    ;;
  tls)
    PUBLIC_HOST="$DOMAIN"
    PUBLIC_SCHEME="https"
    WS_SCHEME="wss"
    APP_URL="$(url_for_public_endpoint "$PUBLIC_SCHEME" "$DOMAIN" "$TLS_PORT")"
    ;;
esac

# Subdomains are OPT-IN: a fresh install is single-domain (one DNS record, one
# SAN entry) and every subdomain vhost is simply omitted by the edge. Existing
# .env values always win (re-runs never lose a configured layout). Pass
# SYNAPSE_SUBDOMAINS=full to derive the classic www/m/mobile/npmr set, or set
# any SYNAPSE_*_DOMAIN individually.
if [ "$DEPLOY_MODE" = "tls" ]; then
  if [ "${SYNAPSE_SUBDOMAINS:-}" = "full" ]; then
    WWW_DOMAIN="${WWW_DOMAIN:-www.$DOMAIN}"
    MOBILE_SHORT_DOMAIN="${MOBILE_SHORT_DOMAIN:-m.$DOMAIN}"
    MOBILE_DOMAIN="${MOBILE_DOMAIN:-mobile.$DOMAIN}"
    REGISTRY_DOMAIN="${REGISTRY_DOMAIN:-npmr.$DOMAIN}"
  fi
  LETSENCRYPT_CERT_NAME_VALUE="${LETSENCRYPT_CERT_NAME_VALUE:-$DOMAIN}"
  LETSENCRYPT_EMAIL_VALUE="${LETSENCRYPT_EMAIL_VALUE:-admin@$DOMAIN}"
elif [ "$DEPLOY_MODE" = "selfsigned" ]; then
  # No fabrication; the cert-name is the directory issue-selfsigned-cert.sh
  # writes under infrastructure/certs/ (Let's Encrypt itself is unused).
  LETSENCRYPT_CERT_NAME_VALUE="${LETSENCRYPT_CERT_NAME_VALUE:-$PUBLIC_HOST}"
  LETSENCRYPT_EMAIL_VALUE=""
  # A registry SUBDOMAIN is a trusted-cert feature: rendering that vhost with a
  # self-signed cert would hand npm clients a strict-ssl failure, so a
  # tls→selfsigned switch drops it (its derived URL is scrubbed below) in
  # favor of the plain-http registry port. www/m/mobile vhosts stay if set —
  # browsers can click through a cert warning; npm cannot.
  REGISTRY_DOMAIN=""
else
  # http mode: force-clear the subdomain + certificate vars. Pre-single-domain
  # setup.sh fabricated www./m./mobile./npmr. "subdomains" OF THE IP plus
  # LETSENCRYPT junk into http-mode .env files — a re-run must scrub them, not
  # preserve them.
  WWW_DOMAIN=""
  MOBILE_SHORT_DOMAIN=""
  MOBILE_DOMAIN=""
  REGISTRY_DOMAIN=""
  LETSENCRYPT_CERT_NAME_VALUE=""
  LETSENCRYPT_EMAIL_VALUE=""
fi
WS_URL="$WS_SCHEME://${APP_URL#*://}"
# Verdaccio publish binding: loopback-only when external access goes through
# the TLS registry-subdomain vhost; all interfaces when the registry is served
# directly on its own host port (no subdomain configured). See the verdaccio
# service comment in docker-compose.yml.
if [ -n "$REGISTRY_DOMAIN" ]; then
  REGISTRY_BIND="127.0.0.1"
else
  REGISTRY_BIND="0.0.0.0"
fi
# External-reachable URL of the private npm registry (end-user side). The
# API embeds it into the dashboard one-click daemon install command. The
# real registry host stays out of the repo — it lives only in this .env.
#
# Preserve operator-custom values, but re-derive anything this script itself
# previously derived: the stored URL is cleared when it matches ANY historical
# self-derived shape — the fabricated npmr.<host> junk, the port form for the
# OLD host/port, or the subdomain form — so host/port/mode changes propagate
# instead of leaving the one-click installer dialing a dead address. When
# nothing changed, the re-derivation below regenerates the identical value.
stored_registry_url="$(read_env_value PUBLIC_NPM_REGISTRY_URL)"
if [ -n "$stored_registry_url" ]; then
  for candidate in \
    "http://npmr.${existing_public_host:-}/" \
    "https://npmr.${existing_public_host:-}/" \
    "$(url_for_public_endpoint http "${existing_public_host:-}" "$stored_registry_port")/" \
    "$(url_for_public_endpoint http "${existing_public_domain:-}" "$stored_registry_port")/" \
    "http://${stored_registry_domain:-}/" \
    "https://${stored_registry_domain:-}/"; do
    if [ "$stored_registry_url" = "$candidate" ]; then
      stored_registry_url=""
      break
    fi
  done
fi
PUBLIC_NPM_REGISTRY_URL="${SYNAPSE_PUBLIC_NPM_REGISTRY_URL:-$stored_registry_url}"
if [ -z "$PUBLIC_NPM_REGISTRY_URL" ]; then
  if [ -n "$REGISTRY_DOMAIN" ]; then
    PUBLIC_NPM_REGISTRY_URL="$PUBLIC_SCHEME://$REGISTRY_DOMAIN/"
  else
    # Direct verdaccio port — deliberately plain http in every mode (npm is not
    # a browser: no secure-context concern, and a self-signed https registry
    # would force strict-ssl workarounds on every consumer).
    PUBLIC_NPM_REGISTRY_URL="$(url_for_public_endpoint http "$PUBLIC_HOST" "$REGISTRY_PORT")/"
  fi
fi
# Public origin Better Auth is mounted on for the mobile app. Empty is a valid,
# meaningful value (same-origin: the client falls back to the API origin), so we
# use `${VAR-default}` (not `:-`) to let `EXPO_PUBLIC_AUTH_ORIGIN= ./setup.sh`
# clear a previously-customized value instead of resurrecting it from .env.
EXPO_PUBLIC_AUTH_ORIGIN_VALUE="${EXPO_PUBLIC_AUTH_ORIGIN-$(read_env_value EXPO_PUBLIC_AUTH_ORIGIN)}"
# Frontend Sentry DSNs — the web and mobile projects' OWN DSNs, distinct from
# the api's SENTRY_DSN (three per-platform Sentry projects; never reuse one
# value). Empty is meaningful (frontend Sentry + the W3C trace bridge off), so
# `${VAR-...}` (not `:-`) lets `NEXT_PUBLIC_SENTRY_DSN= ./setup.sh` clear a
# previously-set value while a plain re-run preserves it from .env.
NEXT_PUBLIC_SENTRY_DSN_VALUE="${NEXT_PUBLIC_SENTRY_DSN-$(read_env_value NEXT_PUBLIC_SENTRY_DSN)}"
EXPO_PUBLIC_SENTRY_DSN_VALUE="${EXPO_PUBLIC_SENTRY_DSN-$(read_env_value EXPO_PUBLIC_SENTRY_DSN)}"
API_PROXY_ORIGIN="${SYNAPSE_API_PROXY_ORIGIN:-http://localhost:3001}"

generate_password() {
  openssl rand -base64 32 | tr -d '/+=' | head -c 32
}

# Ed25519 signing key for device-dispatch envelopes, base64-encoded so it fits
# on a single .env line (envelope-signer decodes base64 PEM). Reuse an existing
# value across re-runs (rotating it would orphan already-paired devices).
SANDBOX_SIGNING_KEY="$(read_env_value SYNAPSE_DEVICE_ENVELOPE_SIGNING_KEY)"
if [ -z "$SANDBOX_SIGNING_KEY" ]; then
  SANDBOX_SIGNING_KEY="$(openssl genpkey -algorithm Ed25519 2>/dev/null | base64 | tr -d '\n')"
fi
# Shared frp token (frps + frpc + the sandbox backend must all agree).
FRP_SHARED_TOKEN_VALUE="$(read_env_value FRP_SHARED_TOKEN)"
if [ -z "$FRP_SHARED_TOKEN_VALUE" ]; then
  FRP_SHARED_TOKEN_VALUE="$(openssl rand -hex 32)"
fi
# SearXNG signing secret (web-search sidecar: Flask secret + image-proxy HMAC).
# Reuse an existing value across re-runs; the compose fallback default is
# internal-network-only, a generated per-install value is always preferred.
SEARXNG_SECRET_VALUE="$(read_env_value SEARXNG_SECRET)"
if [ -z "$SEARXNG_SECRET_VALUE" ]; then
  SEARXNG_SECRET_VALUE="$(openssl rand -hex 32)"
fi

upsert_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"

  if [ ! -f "$file" ]; then
    return
  fi

  if grep -q "^${key}=" "$file"; then
    local current
    current="$(sed -n "s/^${key}=//p" "$file" | tail -n 1)"
    if [ "$current" = "$value" ]; then
      return
    fi

    local tmp_file
    tmp_file="$(mktemp)"
    awk -v key="$key" -v value="$value" '
      BEGIN { replaced = 0 }
      $0 ~ "^" key "=" {
        if (!replaced) {
          print key "=" value
          replaced = 1
        }
        next
      }
      { print }
      END {
        if (!replaced) {
          print key "=" value
        }
      }
    ' "$file" > "$tmp_file"
    cat "$tmp_file" > "$file"
    rm -f "$tmp_file"
    ENV_FILES_UPDATED=true
    echo "Updated $key in $file"
  else
    {
      printf '\n'
      printf '%s=%s\n' "$key" "$value"
    } >> "$file"
    ENV_FILES_UPDATED=true
    echo "Added $key to $file"
  fi
}

# Ensure a comma-separated env var CONTAINS each required token, preserving any
# extra values the operator added. Used for AUTH_TRUSTED_ORIGINS so an existing
# .env (created before this var existed, or customized) still trusts the app
# URL + the mobile app scheme — otherwise @better-auth/expo can't return the
# session on a native OAuth deep-link callback. Adds the key if missing.
ensure_csv_env_contains() {
  local file="$1"
  local key="$2"
  shift 2
  local required=("$@")

  if [ ! -f "$file" ]; then
    return
  fi

  local current=""
  if grep -q "^${key}=" "$file"; then
    current="$(sed -n "s/^${key}=//p" "$file" | tail -n 1)"
  fi

  # Split current on commas into a set; append any required token not present.
  local merged="$current"
  local token
  for token in "${required[@]}"; do
    case ",${merged}," in
      *",${token},"*) : ;; # already present
      *)
        if [ -z "$merged" ]; then
          merged="$token"
        else
          merged="${merged},${token}"
        fi
        ;;
    esac
  done

  if [ "$merged" != "$current" ]; then
    upsert_env_var "$file" "$key" "$merged"
  fi
}

# Remove ONE exact token from a comma-separated env var (used to retire the
# previously derived app origin from AUTH_TRUSTED_ORIGINS when the deploy URL
# changes — a mode/host switch must not leave the old plain-http origin
# trusted). Operator-added extras never match and are preserved.
remove_csv_env_token() {
  local file="$1"
  local key="$2"
  local token="$3"

  if [ ! -f "$file" ] || [ -z "$token" ]; then
    return
  fi
  if ! grep -q "^${key}=" "$file"; then
    return
  fi

  local current
  current="$(sed -n "s/^${key}=//p" "$file" | tail -n 1)"
  local rebuilt=""
  local part
  local IFS=','
  for part in $current; do
    if [ "$part" = "$token" ]; then
      continue
    fi
    if [ -z "$rebuilt" ]; then
      rebuilt="$part"
    else
      rebuilt="$rebuilt,$part"
    fi
  done

  if [ "$rebuilt" != "$current" ]; then
    upsert_env_var "$file" "$key" "$rebuilt"
  fi
}

ROOT_ENV_CREATED=false
WEB_ENV_CREATED=false
MOBILE_ENV_CREATED=false
ENV_FILES_UPDATED=false

if [ ! -f "$ENV_FILE" ]; then
  POSTGRES_PASSWORD=$(generate_password)
  REDIS_PASSWORD=$(generate_password)
  APP_SECRET=$(generate_password)
  MCP_ENCRYPTION_KEY=$(generate_password)
  BETTER_AUTH_SECRET=$(generate_password)

  cat > "$ENV_FILE" <<EOF
# Auto-generated by setup.sh — $(date -u '+%Y-%m-%dT%H:%M:%SZ')
# Do NOT commit this file to git.

# PostgreSQL
POSTGRES_USER=synapse
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=synapse

# Redis
REDIS_PASSWORD=$REDIS_PASSWORD

# Application secrets
APP_SECRET=$APP_SECRET
MCP_ENCRYPTION_KEY=$MCP_ENCRYPTION_KEY

# Better Auth (account / session / third-party login). BETTER_AUTH_SECRET signs
# sessions; it falls back to AUTH_SECRET / APP_SECRET if unset. AUTH_TRUSTED_ORIGINS
# is a comma-separated allowlist of browser/app origins (app scheme included for
# the mobile app); APP_BASE_URL below is the public origin Better Auth mounts on.
BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
AUTH_TRUSTED_ORIGINS=$APP_URL,synapse://
# Feishu / Lark OAuth (genericOAuth provider). Leave empty to disable Feishu login.
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_INTL=false

# Server-side actor isolation (sandbox). Off by default; set SANDBOX_PROVIDER=local|docker
# to turn on. Signing key is base64-encoded PEM (single line).
#   local  → same-host device-runtime child (direct loopback endpoint).
#   docker → requires FRP_SHARED_TOKEN, AND layering
#            docker-compose.sandbox-docker.yml to mount the host docker socket.
#            See deploy.md §8b.
SANDBOX_PROVIDER=none
SYNAPSE_DEVICE_ENVELOPE_SIGNING_KEY=$SANDBOX_SIGNING_KEY
FRP_SHARED_TOKEN=$FRP_SHARED_TOKEN_VALUE

# Deployment domains
SYNAPSE_DEPLOY_MODE=$DEPLOY_MODE
SYNAPSE_PUBLIC_HOST=$PUBLIC_HOST
SYNAPSE_HTTP_PORT=$HTTP_PORT
SYNAPSE_TLS_PORT=$TLS_PORT
SYNAPSE_TLS_ACME_PORT=$TLS_ACME_PORT
SYNAPSE_PUBLIC_DOMAIN=$DOMAIN
SYNAPSE_WWW_DOMAIN=$WWW_DOMAIN
SYNAPSE_MOBILE_SHORT_DOMAIN=$MOBILE_SHORT_DOMAIN
SYNAPSE_MOBILE_DOMAIN=$MOBILE_DOMAIN
SYNAPSE_REGISTRY_DOMAIN=$REGISTRY_DOMAIN
LETSENCRYPT_CERT_NAME=$LETSENCRYPT_CERT_NAME_VALUE
LETSENCRYPT_EMAIL=$LETSENCRYPT_EMAIL_VALUE

# Application URLs
APP_BASE_URL=$APP_URL
BASE_URL=$APP_URL
NEXT_PUBLIC_APP_URL=$APP_URL
NEXT_PUBLIC_SITE_URL=$APP_URL

# Application runtime
PORT=3001
HOST=localhost
DATABASE_URL=postgresql://synapse:${POSTGRES_PASSWORD}@localhost:5432/synapse
REDIS_URL=redis://:${REDIS_PASSWORD}@localhost:6379
PLATFORM_ADMIN_EMAILS=demo@synapse.dev
STORAGE_DIR=storage/files
# Embedding (semantic memory) is OFF by default in local dev (EMBEDDING_PROVIDER
# unset => none => recall is lexical-only). The api bundles NO embedding engine; to
# enable semantic memory, run the embed sidecar and set EMBEDDING_PROVIDER=local +
# EMBEDDING_LOCAL_URL, or point at a cloud provider. See .env.example (Embedding).

# Private npm registry (end-user reachable URL). Used by the API to build
# the dashboard one-click daemon install command. Real host stays in .env.
# Without a registry subdomain, verdaccio's own port is published directly
# (bind 0.0.0.0); with one, external access goes through nginx (bind loopback).
PUBLIC_NPM_REGISTRY_URL=$PUBLIC_NPM_REGISTRY_URL
SYNAPSE_REGISTRY_BIND=$REGISTRY_BIND
SYNAPSE_REGISTRY_PORT=$REGISTRY_PORT

# Realtime ASR (Volcengine / Doubao Seed ASR Streaming 2.0)
ASR_PROVIDER=volcengine
VOLCENGINE_ASR_APP_ID=
VOLCENGINE_ASR_ACCESS_TOKEN=
VOLCENGINE_ASR_SECRET_KEY=
VOLCENGINE_ASR_RESOURCE_ID=volc.seedasr.sauc.duration
VOLCENGINE_ASR_WS_URL=wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async
VOLCENGINE_ASR_MAX_CONCURRENCY=3
VOLCENGINE_ASR_CONNECT_TIMEOUT_MS=10000
VOLCENGINE_ASR_IDLE_TIMEOUT_MS=15000

# Frontend runtime
NEXT_PUBLIC_API_URL=/api/v1
NEXT_PUBLIC_WS_URL=$WS_URL
EXPO_PUBLIC_API_URL=$APP_URL/api/v1
# Public origin Better Auth is mounted on for the mobile app. Leave empty for
# same-origin deploys (falls back to the API origin); set it only when the
# browser-facing public origin differs from the internal API origin.
EXPO_PUBLIC_AUTH_ORIGIN=$EXPO_PUBLIC_AUTH_ORIGIN_VALUE
EXPO_BASE_URL=/mobile
# Frontend Sentry DSNs (per-platform projects — distinct from the api's
# SENTRY_DSN; build-time inlined into the web/mobile-web images; empty =
# frontend Sentry + trace bridge off). See .env.example (Observability).
NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN_VALUE
EXPO_PUBLIC_SENTRY_DSN=$EXPO_PUBLIC_SENTRY_DSN_VALUE
EOF

  chmod 600 "$ENV_FILE"
  ROOT_ENV_CREATED=true
  echo "Generated root env at $ENV_FILE"
else
  echo ".env already exists at $ENV_FILE"
fi

upsert_env_var "$ENV_FILE" SYNAPSE_DEPLOY_MODE "$DEPLOY_MODE"
upsert_env_var "$ENV_FILE" SYNAPSE_PUBLIC_HOST "$PUBLIC_HOST"
upsert_env_var "$ENV_FILE" SYNAPSE_HTTP_PORT "$HTTP_PORT"
upsert_env_var "$ENV_FILE" SYNAPSE_TLS_PORT "$TLS_PORT"
upsert_env_var "$ENV_FILE" SYNAPSE_TLS_ACME_PORT "$TLS_ACME_PORT"
upsert_env_var "$ENV_FILE" SYNAPSE_PUBLIC_DOMAIN "$DOMAIN"
upsert_env_var "$ENV_FILE" SYNAPSE_WWW_DOMAIN "$WWW_DOMAIN"
# Sandbox secrets — added to existing .env files too (don't rotate if present).
upsert_env_var "$ENV_FILE" SYNAPSE_DEVICE_ENVELOPE_SIGNING_KEY "$SANDBOX_SIGNING_KEY"
upsert_env_var "$ENV_FILE" FRP_SHARED_TOKEN "$FRP_SHARED_TOKEN_VALUE"
upsert_env_var "$ENV_FILE" SEARXNG_SECRET "$SEARXNG_SECRET_VALUE"
upsert_env_var "$ENV_FILE" SYNAPSE_MOBILE_SHORT_DOMAIN "$MOBILE_SHORT_DOMAIN"
upsert_env_var "$ENV_FILE" SYNAPSE_MOBILE_DOMAIN "$MOBILE_DOMAIN"
upsert_env_var "$ENV_FILE" SYNAPSE_REGISTRY_DOMAIN "$REGISTRY_DOMAIN"
upsert_env_var "$ENV_FILE" LETSENCRYPT_CERT_NAME "$LETSENCRYPT_CERT_NAME_VALUE"
upsert_env_var "$ENV_FILE" LETSENCRYPT_EMAIL "$LETSENCRYPT_EMAIL_VALUE"
upsert_env_var "$ENV_FILE" PUBLIC_NPM_REGISTRY_URL "$PUBLIC_NPM_REGISTRY_URL"
upsert_env_var "$ENV_FILE" SYNAPSE_REGISTRY_BIND "$REGISTRY_BIND"
upsert_env_var "$ENV_FILE" SYNAPSE_REGISTRY_PORT "$REGISTRY_PORT"
upsert_env_var "$ENV_FILE" APP_BASE_URL "$APP_URL"
upsert_env_var "$ENV_FILE" BASE_URL "$APP_URL"
upsert_env_var "$ENV_FILE" NEXT_PUBLIC_API_URL "/api/v1"
upsert_env_var "$ENV_FILE" NEXT_PUBLIC_WS_URL "$WS_URL"
upsert_env_var "$ENV_FILE" NEXT_PUBLIC_APP_URL "$APP_URL"
upsert_env_var "$ENV_FILE" NEXT_PUBLIC_SITE_URL "$APP_URL"
upsert_env_var "$ENV_FILE" EXPO_PUBLIC_API_URL "$APP_URL/api/v1"
upsert_env_var "$ENV_FILE" EXPO_PUBLIC_AUTH_ORIGIN "$EXPO_PUBLIC_AUTH_ORIGIN_VALUE"
upsert_env_var "$ENV_FILE" EXPO_BASE_URL "/mobile"
upsert_env_var "$ENV_FILE" NEXT_PUBLIC_SENTRY_DSN "$NEXT_PUBLIC_SENTRY_DSN_VALUE"
upsert_env_var "$ENV_FILE" EXPO_PUBLIC_SENTRY_DSN "$EXPO_PUBLIC_SENTRY_DSN_VALUE"
# Retire the PREVIOUS derived origin first when the deploy URL changed (a
# mode/host switch must not leave e.g. the old plain-http origin trusted),
# then merge (not overwrite) so customized extras + the mobile app scheme
# required for native Feishu OAuth deep-link return survive.
if [ -n "$existing_app_base_url" ] && [ "$existing_app_base_url" != "$APP_URL" ]; then
  remove_csv_env_token "$ENV_FILE" AUTH_TRUSTED_ORIGINS "$existing_app_base_url"
fi
ensure_csv_env_contains "$ENV_FILE" AUTH_TRUSTED_ORIGINS "$APP_URL" "synapse://"

if [ ! -f "$WEB_ENV_FILE" ]; then
  mkdir -p "$(dirname "$WEB_ENV_FILE")"
  cat > "$WEB_ENV_FILE" <<EOF
# Auto-generated by setup.sh — $(date -u '+%Y-%m-%dT%H:%M:%SZ')
NEXT_PUBLIC_API_URL=/api/v1
NEXT_PUBLIC_WS_URL=$WS_URL
NEXT_PUBLIC_APP_URL=$APP_URL
NEXT_PUBLIC_SITE_URL=$APP_URL
# Optional: comma-separated hostnames or URLs for additional Next dev origins.
# NEXT_ALLOWED_DEV_ORIGINS=$DOMAIN
API_PROXY_ORIGIN=$API_PROXY_ORIGIN
# Web Sentry project DSN (empty = web Sentry + trace bridge off).
NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN_VALUE
EOF

  chmod 600 "$WEB_ENV_FILE"
  WEB_ENV_CREATED=true
  echo "Generated web env at $WEB_ENV_FILE"
else
  echo "Web env already exists at $WEB_ENV_FILE"
fi

upsert_env_var "$WEB_ENV_FILE" NEXT_PUBLIC_API_URL "/api/v1"
upsert_env_var "$WEB_ENV_FILE" NEXT_PUBLIC_WS_URL "$WS_URL"
upsert_env_var "$WEB_ENV_FILE" NEXT_PUBLIC_APP_URL "$APP_URL"
upsert_env_var "$WEB_ENV_FILE" NEXT_PUBLIC_SITE_URL "$APP_URL"
upsert_env_var "$WEB_ENV_FILE" API_PROXY_ORIGIN "$API_PROXY_ORIGIN"
upsert_env_var "$WEB_ENV_FILE" NEXT_PUBLIC_SENTRY_DSN "$NEXT_PUBLIC_SENTRY_DSN_VALUE"

# Mobile (Expo) reads .env ONLY from its own project dir (packages/mobile-app),
# never the monorepo root, so the deploy address from the root .env must be
# fanned out here — same per-package pattern as web-next above. Values mirror
# the root .env exactly (single source of truth = APP_URL / the derived
# EXPO_PUBLIC_AUTH_ORIGIN_VALUE).
if [ ! -f "$MOBILE_ENV_FILE" ]; then
  mkdir -p "$(dirname "$MOBILE_ENV_FILE")"
  cat > "$MOBILE_ENV_FILE" <<EOF
# Auto-generated by setup.sh — $(date -u '+%Y-%m-%dT%H:%M:%SZ')
EXPO_PUBLIC_API_URL=$APP_URL/api/v1
# Public origin Better Auth is mounted on. Leave empty for same-origin deploys
# (falls back to the API origin); set it only when the browser-facing public
# origin differs from the internal API origin.
EXPO_PUBLIC_AUTH_ORIGIN=$EXPO_PUBLIC_AUTH_ORIGIN_VALUE
EXPO_BASE_URL=/mobile
# Mobile Sentry project DSN (empty = mobile Sentry + trace bridge off).
EXPO_PUBLIC_SENTRY_DSN=$EXPO_PUBLIC_SENTRY_DSN_VALUE
EOF

  chmod 600 "$MOBILE_ENV_FILE"
  MOBILE_ENV_CREATED=true
  echo "Generated mobile env at $MOBILE_ENV_FILE"
else
  echo "Mobile env already exists at $MOBILE_ENV_FILE"
fi

upsert_env_var "$MOBILE_ENV_FILE" EXPO_PUBLIC_API_URL "$APP_URL/api/v1"
upsert_env_var "$MOBILE_ENV_FILE" EXPO_PUBLIC_AUTH_ORIGIN "$EXPO_PUBLIC_AUTH_ORIGIN_VALUE"
upsert_env_var "$MOBILE_ENV_FILE" EXPO_BASE_URL "/mobile"
upsert_env_var "$MOBILE_ENV_FILE" EXPO_PUBLIC_SENTRY_DSN "$EXPO_PUBLIC_SENTRY_DSN_VALUE"

if [ "$ROOT_ENV_CREATED" = false ] && [ "$WEB_ENV_CREATED" = false ] && [ "$MOBILE_ENV_CREATED" = false ] && [ "$ENV_FILES_UPDATED" = false ]; then
  echo "No env files were created."
  exit 0
fi

echo "Local secrets and URLs have been initialized."
echo ""
echo "Model configuration (required before chat will work):"
echo "  - Copy packages/api/config/model-groups.yaml.example to"
echo "    packages/api/config/model-groups.yaml"
echo "  - Fill in the referenced \${ENV} variables (e.g. ANTHROPIC_API_KEY) in .env"
echo "  - The file is applied automatically by db:rebuild (step 4 below), or run"
echo "    'npm run db:seed:model-groups' on its own."
echo "  (The real model-groups.yaml is NOT auto-created or committed — it is"
echo "   gitignored. Without it, db:rebuild skips model import and chat fails"
echo "   loudly until a platform model group is configured.)"
echo ""
echo "Next steps:"
echo "  1. Install Docker and Docker Compose on the host if they are missing"
echo "  2. Run: docker compose --profile production build api web mobile-web"
echo "  3. Run: docker compose up -d postgres redis"
echo "  4. Run: docker compose --profile production run --rm api npm run db:rebuild:runtime -w packages/api"
if [ "$DEPLOY_MODE" = "http" ]; then
  echo "  5. Run: docker compose --profile production --profile http up -d api web mobile-web nginx-http"
elif [ "$DEPLOY_MODE" = "selfsigned" ]; then
  echo "  5. Run: ./infrastructure/scripts/issue-selfsigned-cert.sh"
  echo "  6. Run: docker compose --profile production --profile tls up -d api web mobile-web nginx"
  echo "     (Browsers will warn about the self-signed certificate; trust it manually"
  echo "      or import infrastructure/certs/${LETSENCRYPT_CERT_NAME_VALUE}/fullchain.pem on client devices.)"
else
  echo "  5. Run: ./infrastructure/scripts/issue-cert.sh"
  echo "  6. Run: docker compose --profile production --profile tls up -d api web mobile-web nginx"
fi
