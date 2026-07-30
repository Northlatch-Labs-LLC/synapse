#!/bin/sh
# Renders the TLS edge config from the synapse templates, with the conditionals
# plain envsubst cannot express. Mounted at
# /docker-entrypoint.d/15-synapse-render-edge-config.sh so the official nginx
# entrypoint runs it BEFORE 20-envsubst-on-templates.sh (which then finds
# /etc/nginx/templates empty and no-ops — the templates are mounted at
# /etc/nginx/synapse-templates instead, precisely so the stock script never
# double-renders them).
#
# Owns three policies the templates reference but must not decide:
#   * optional vhost fragments — the mobile-subdomain and registry-subdomain
#     server blocks are rendered only when their domains are configured (an
#     empty server_name is a config ERROR, so omission is the only safe form);
#   * HSTS — emitted for real certificates (mode tls), EMPTY for
#     mode selfsigned: HSTS on an untrusted cert removes the browser's manual
#     "proceed anyway" bypass and bricks the deploy for its own users;
#   * cert location — Let's Encrypt live dir (tls) vs the bind-mounted
#     self-signed dir (selfsigned), verified to exist BEFORE nginx boots so the
#     operator gets an actionable message instead of an ssl_certificate emerg.
#
# This script also re-validates the required vars: docker-compose deliberately
# declares them with soft `:-` defaults (a hard `:?` would fail compose
# INTERPOLATION for every profile, forcing http-mode deploys to carry dummy
# domain values), so the fail-loud duty lives here, at the only consumer.
set -eu

TEMPLATES_DIR=/etc/nginx/synapse-templates
OUT_DIR=/etc/nginx/conf.d

fail() {
  echo >&2 "synapse-edge: $1"
  echo >&2 "synapse-edge: run ./setup.sh (and see deploy.md) to generate the deploy variables."
  exit 1
}

MODE="${SYNAPSE_DEPLOY_MODE:-tls}"
case "$MODE" in
  tls|selfsigned) ;;
  http) fail "SYNAPSE_DEPLOY_MODE=http does not use this TLS edge — start nginx-http (--profile http) instead" ;;
  *) fail "unsupported SYNAPSE_DEPLOY_MODE '$MODE' (expected tls, selfsigned, or http)" ;;
esac

[ -n "${SYNAPSE_PUBLIC_DOMAIN:-}" ] || fail "SYNAPSE_PUBLIC_DOMAIN is required"
[ -n "${LETSENCRYPT_CERT_NAME:-}" ] || fail "LETSENCRYPT_CERT_NAME is required (the certificate directory name)"

if [ "$MODE" = "selfsigned" ]; then
  SYNAPSE_TLS_CERT_DIR="/etc/synapse-certs/${LETSENCRYPT_CERT_NAME}"
  SYNAPSE_HSTS_VALUE=""
  CERT_HINT="./infrastructure/scripts/issue-selfsigned-cert.sh"
else
  SYNAPSE_TLS_CERT_DIR="/etc/letsencrypt/live/${LETSENCRYPT_CERT_NAME}"
  SYNAPSE_HSTS_VALUE="max-age=31536000"
  CERT_HINT="./infrastructure/scripts/issue-cert.sh"
fi
for cert_file in fullchain.pem privkey.pem chain.pem; do
  [ -f "${SYNAPSE_TLS_CERT_DIR}/${cert_file}" ] || \
    fail "certificate file not found at ${SYNAPSE_TLS_CERT_DIR}/${cert_file} — run ${CERT_HINT} first"
done

# External TLS port (the HOST side of the compose port mapping; the container
# always listens on 443). Non-443 deploys need it appended to the http->https
# redirect and advertised in Alt-Svc.
SYNAPSE_TLS_PORT="${SYNAPSE_TLS_PORT:-443}"
if [ "$SYNAPSE_TLS_PORT" = "443" ]; then
  SYNAPSE_TLS_REDIRECT_SUFFIX=""
else
  SYNAPSE_TLS_REDIRECT_SUFFIX=":${SYNAPSE_TLS_PORT}"
fi

export SYNAPSE_PUBLIC_DOMAIN SYNAPSE_TLS_CERT_DIR SYNAPSE_HSTS_VALUE \
  SYNAPSE_TLS_PORT SYNAPSE_TLS_REDIRECT_SUFFIX
export SYNAPSE_WWW_DOMAIN="${SYNAPSE_WWW_DOMAIN:-}"
export SYNAPSE_MOBILE_SHORT_DOMAIN="${SYNAPSE_MOBILE_SHORT_DOMAIN:-}"
export SYNAPSE_MOBILE_DOMAIN="${SYNAPSE_MOBILE_DOMAIN:-}"
export SYNAPSE_REGISTRY_DOMAIN="${SYNAPSE_REGISTRY_DOMAIN:-}"

# Explicit substitution list: the config is full of nginx runtime $vars ($host,
# $request_uri, ...) that a bare envsubst would blank out.
SUBST_VARS='$SYNAPSE_PUBLIC_DOMAIN $SYNAPSE_WWW_DOMAIN $SYNAPSE_MOBILE_SHORT_DOMAIN $SYNAPSE_MOBILE_DOMAIN $SYNAPSE_REGISTRY_DOMAIN $SYNAPSE_TLS_CERT_DIR $SYNAPSE_HSTS_VALUE $SYNAPSE_TLS_PORT $SYNAPSE_TLS_REDIRECT_SUFFIX'

render() {
  envsubst "$SUBST_VARS" < "$TEMPLATES_DIR/$1" > "$OUT_DIR/$2"
  echo "synapse-edge: rendered $1 -> $OUT_DIR/$2"
}

render public.conf.template default.conf

# Optional fragments: render when configured, remove stale copies when not
# (the container may be recreated after a domain was unset).
if [ -n "$SYNAPSE_MOBILE_SHORT_DOMAIN" ] || [ -n "$SYNAPSE_MOBILE_DOMAIN" ]; then
  render public-mobile-domains.conf.template synapse-mobile-domains.conf
else
  rm -f "$OUT_DIR/synapse-mobile-domains.conf"
  echo "synapse-edge: mobile subdomains not configured — vhost omitted (mobile web stays at /mobile/)"
fi

if [ -n "$SYNAPSE_REGISTRY_DOMAIN" ]; then
  render public-registry-domain.conf.template synapse-registry-domain.conf
else
  rm -f "$OUT_DIR/synapse-registry-domain.conf"
  echo "synapse-edge: registry subdomain not configured — vhost omitted (use the SYNAPSE_REGISTRY_PORT direct port instead)"
fi
