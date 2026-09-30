# Synapse Helm chart (G-S1 enterprise spine)

Deploys the Synapse api + web tiers with an HA posture: replicas ≥ 2, topology
spread, PodDisruptionBudgets, and an ingress with WebSocket-safe timeouts.

## HA topology policy

The chart **points at** HA databases rather than owning them:

- **Postgres**: `postgresql.external` (Patroni / CloudSQL / RDS …). The embedded
  single-node option is dev/eval only and is not HA.
- **Redis**: `redis.external` (Valkey cluster / managed Redis). Same rule.
- Secrets are never values: pass `existingSecret` names; the api reads
  `BETTER_AUTH_SECRET`, `AUDIT_EXPORT_SIGNING_KEY`, and DB passwords from them.

## Web runtime configuration

Next.js inlines `NEXT_PUBLIC_*` at **build** time, so the web image is built
per environment (compose passes them as build args; do the same in your image
pipeline) or wrapped with the documented envsubst entrypoint. The chart passes
the internal API origin (`SYNAPSE_API_INTERNAL_URL`) at runtime for the proxy.

## Install

```sh
helm upgrade --install synapse infrastructure/helm/synapse \
  --namespace synapse --create-namespace \
  --set global.appBaseUrl=https://synapse.example.com \
  --set ingress.host=synapse.example.com \
  --set postgresql.external.host=patroni-primary.postgres.svc \
  --set redis.external.host=valkey-primary.redis.svc
```

## Values of note

| Key | Purpose |
|---|---|
| `api.env.ssoOidcProviders` | G-S1 SSO — JSON array, see `docs/adr/0002` + `.env.example` |
| `api.env.otelExporterOtlpEndpoint` | OTLP collector for traces (Tempo/Alloy/Jaeger) |
| `api.existingSecret` | Carries `BETTER_AUTH_SECRET`, `AUDIT_EXPORT_SIGNING_KEY` |
| `postgresql.external.*` / `redis.external.*` | HA datastore endpoints + secret refs |

## Verification

`helm lint` and `helm template` must pass — see `evidence/gs1/helm.md`.
