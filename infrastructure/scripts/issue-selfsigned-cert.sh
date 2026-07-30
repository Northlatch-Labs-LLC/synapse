#!/usr/bin/env bash
# Generates the self-signed certificate for SYNAPSE_DEPLOY_MODE=selfsigned.
#
# Writes infrastructure/certs/<cert-name>/{privkey,fullchain,chain}.pem — the
# same file layout as a Let's Encrypt live dir — so the TLS nginx templates
# work unchanged; render-edge-config.sh points them at the bind-mounted
# /etc/synapse-certs/<cert-name> in selfsigned mode. Runs entirely on the host
# with the host openssl (which setup.sh already requires); no container image
# involved, so it works on pull-restricted networks.
#
# Long-lived (10y) on purpose: there is no renewal story for a self-signed
# cert — clients trust it manually once. Re-run this script to rotate (clients
# must then re-trust).
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
if [ "$DEPLOY_MODE" != "selfsigned" ]; then
  echo "SYNAPSE_DEPLOY_MODE=$DEPLOY_MODE does not use self-signed certificates." >&2
  echo "Run SYNAPSE_DEPLOY_MODE=selfsigned SYNAPSE_PUBLIC_HOST=<ip-or-host> ./setup.sh first." >&2
  exit 1
fi

PUBLIC_HOST="${SYNAPSE_PUBLIC_HOST:?SYNAPSE_PUBLIC_HOST is required in .env. Run setup.sh first.}"
CERT_NAME="${LETSENCRYPT_CERT_NAME:-$PUBLIC_HOST}"
CERT_DIR="$REPO_ROOT/infrastructure/certs/$CERT_NAME"
DAYS="${SYNAPSE_SELFSIGNED_DAYS:-3650}"

# Browsers match an IP-literal origin against IP SANs and a hostname against
# DNS SANs — emit the right kind per value. IPv6 hosts may arrive bracketed
# from URLs (strip) and with a %zone suffix (strip — zones are not valid in
# SANs). A dotted hostname that merely STARTS with digits (203.0.113.7.nip.io —
# the canonical way to name a bare IP) is DNS, so the IPv4 test must anchor the
# whole value, not glob prefixes.
san_entry() {
  local host="$1"
  host="${host#[}"
  host="${host%]}"
  host="${host%\%*}"
  if [[ "$host" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    printf 'IP:%s' "$host"                                          # IPv4
  elif [[ "$host" =~ ^[^:]+:[0-9]+$ ]]; then
    # Exactly one colon + numeric tail = host:port, not IPv6. openssl would
    # only emit a cryptic 'bad ip address' — fail with the actual mistake.
    echo "SYNAPSE_PUBLIC_HOST-derived SAN value '$host' looks like host:port." >&2
    echo "Use a bare host in SYNAPSE_PUBLIC_HOST; the port belongs in SYNAPSE_TLS_PORT." >&2
    exit 1
  elif [[ "$host" == *:* ]]; then
    printf 'IP:%s' "$host"                                          # IPv6
  else
    printf 'DNS:%s' "$host"
  fi
}

# SAN list: the public host, the public domain if distinct, plus any explicitly
# configured subdomains. Deduplicated; empties skipped.
SAN=""
declare -A seen=()
for host in "$PUBLIC_HOST" "${SYNAPSE_PUBLIC_DOMAIN:-}" "${SYNAPSE_WWW_DOMAIN:-}" \
  "${SYNAPSE_MOBILE_SHORT_DOMAIN:-}" "${SYNAPSE_MOBILE_DOMAIN:-}" "${SYNAPSE_REGISTRY_DOMAIN:-}"; do
  if [ -z "$host" ] || [ -n "${seen[$host]:-}" ]; then
    continue
  fi
  seen[$host]=1
  entry="$(san_entry "$host")"
  if [ -z "$SAN" ]; then
    SAN="$entry"
  else
    SAN="$SAN,$entry"
  fi
done

mkdir -p "$CERT_DIR"
umask 077

openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
  -keyout "$CERT_DIR/privkey.pem" \
  -out "$CERT_DIR/fullchain.pem" \
  -days "$DAYS" -nodes \
  -subj "/CN=$PUBLIC_HOST" \
  -addext "subjectAltName=$SAN" \
  -addext "basicConstraints=CA:FALSE" \
  -addext "keyUsage=digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"

# chain.pem: the cert is its own chain (ssl_trusted_certificate consumer).
cp "$CERT_DIR/fullchain.pem" "$CERT_DIR/chain.pem"
chmod 600 "$CERT_DIR/privkey.pem"
chmod 644 "$CERT_DIR/fullchain.pem" "$CERT_DIR/chain.pem"

echo "Self-signed certificate written to $CERT_DIR (SAN: $SAN, valid $DAYS days)."
echo "Start (or recreate) the TLS edge to pick it up:"
echo "  docker compose --profile production --profile tls up -d --force-recreate nginx"
echo "Clients must trust it manually, or import $CERT_DIR/fullchain.pem."
