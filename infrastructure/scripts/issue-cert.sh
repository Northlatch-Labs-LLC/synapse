#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi

DEPLOY_MODE="${SYNAPSE_DEPLOY_MODE:-tls}"
if [ "$DEPLOY_MODE" != "tls" ]; then
  echo "SYNAPSE_DEPLOY_MODE=$DEPLOY_MODE does not use Let's Encrypt certificates." >&2
  if [ "$DEPLOY_MODE" = "selfsigned" ]; then
    echo "Use ./infrastructure/scripts/issue-selfsigned-cert.sh instead." >&2
  else
    echo "Switch to SYNAPSE_DEPLOY_MODE=tls before running issue-cert.sh." >&2
  fi
  exit 1
fi

PRIMARY_DOMAIN="${SYNAPSE_PUBLIC_DOMAIN:?SYNAPSE_PUBLIC_DOMAIN is required in .env. Run SYNAPSE_PUBLIC_DOMAIN=<domain> ./setup.sh first.}"
# Subdomains are OPT-IN since the single-domain layout landed: an empty var
# means "not part of this deployment", so no www./m./mobile./npmr. fallbacks
# are fabricated here — setup.sh is the only deriver (SYNAPSE_SUBDOMAINS=full).
WWW_DOMAIN="${SYNAPSE_WWW_DOMAIN:-}"
MOBILE_SHORT_DOMAIN="${SYNAPSE_MOBILE_SHORT_DOMAIN:-}"
MOBILE_DOMAIN="${SYNAPSE_MOBILE_DOMAIN:-}"
REGISTRY_DOMAIN="${SYNAPSE_REGISTRY_DOMAIN:-}"
EMAIL="${LETSENCRYPT_EMAIL:-admin@${PRIMARY_DOMAIN}}"
CERT_NAME="${LETSENCRYPT_CERT_NAME:-${PRIMARY_DOMAIN}}"
DOMAINS=(
  "$PRIMARY_DOMAIN"
  "$WWW_DOMAIN"
  "$MOBILE_SHORT_DOMAIN"
  "$MOBILE_DOMAIN"
  "$REGISTRY_DOMAIN"
)

domain_args=()
declare -A seen_domains=()
for domain in "${DOMAINS[@]}"; do
  if [ -z "$domain" ] || [ -n "${seen_domains[$domain]:-}" ]; then
    continue
  fi
  seen_domains[$domain]=1
  domain_args+=("-d" "$domain")
done

docker compose --profile production --profile tls stop nginx >/dev/null 2>&1 || true
docker compose --profile certbot up -d acme-http

cleanup() {
  docker compose --profile certbot stop acme-http >/dev/null 2>&1 || true
}
trap cleanup EXIT

# --expand: a no-op while the domain set is unchanged, but required when a
# re-run GROWS the SAN list for an existing cert name (e.g. a single-domain
# deploy later opts into SYNAPSE_SUBDOMAINS=full) — without it a non-TTY run
# fails with "Use --expand" instead of updating the lineage.
docker compose --profile certbot run --rm certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --cert-name "$CERT_NAME" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --expand \
  "${domain_args[@]}"
