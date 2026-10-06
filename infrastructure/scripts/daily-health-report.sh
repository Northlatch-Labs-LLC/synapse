#!/usr/bin/env bash
# Synappse daily health report — a plain-English email about how the platform
# and its users' agents are doing. Runs on gf-host via cron (root).
#
# Silent no-op when RESEND_API_KEY is absent from /data/synapse/.env, so it is
# safe to install before the key exists. Delivery target: EMAIL_ALERT_TO
# (default ops@northlatch.dev). Sender: EMAIL_FROM (default
# Synappse <no-reply@synappse.work>).
#
# Logs: /data/backups/synapse/health-report.log
set -uo pipefail

ENV_FILE="/data/synapse/.env"
LOG_FILE="/data/backups/synapse/health-report.log"
CONTAINER_DB="postgres-1jrsnyfksvyfkivawvyhej4x"
VM="gf-30-synapse"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG_FILE" 2>/dev/null || true; }

[ -r "$ENV_FILE" ] || { log "no env file, exiting"; exit 0; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
[ -n "${RESEND_API_KEY:-}" ] || { log "RESEND_API_KEY not set, exiting"; exit 0; }

TO="${EMAIL_ALERT_TO:-hello@projectxprotocol.dev}"
FROM="${EMAIL_FROM:-Synappse <no-reply@synappse.work>}"

db() {
  sudo -n incus exec "$VM" -- docker exec "$CONTAINER_DB" \
    psql -U synapse -d synapse -At -c "$1" 2>/dev/null
}

users_total=$(db "SELECT count(*) FROM users;")
users_active=$(db "SELECT count(*) FROM users WHERE deleted_at IS NULL;")
users_new=$(db "SELECT count(*) FROM users WHERE created_at > now() - interval '24 hours';")
turns_24h=$(db "SELECT count(*) FROM turns WHERE started_at > now() - interval '24 hours';")
steps_total=$(db "SELECT count(*) FROM provider_steps WHERE created_at > now() - interval '24 hours';")
steps_failed=$(db "SELECT count(*) FROM provider_steps WHERE created_at > now() - interval '24 hours' AND status <> 'success';")
sessions_stuck=$(db "SELECT count(*) FROM sessions WHERE status = 'running' AND updated_at < now() - interval '1 hour';")
never_activated=$(db "SELECT string_agg(u.email, ', ') FROM users u WHERE u.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM workspace_members wm JOIN conversations c ON c.workspace_id = wm.workspace_id JOIN turns t ON t.conversation_id = c.id WHERE wm.user_id = u.id);")

[ -n "$users_total" ] || { log "database unreachable, exiting"; exit 1; }
users_total=${users_total:-0}; users_active=${users_active:-0}; users_new=${users_new:-0}
turns_24h=${turns_24h:-0}; steps_total=${steps_total:-0}; steps_failed=${steps_failed:-0}
sessions_stuck=${sessions_stuck:-0}; never_activated=${never_activated:-}

VERDICT="all clear"
[ "$steps_failed" -gt 0 ] && VERDICT="ATTENTION — agent errors in the last 24 hours"
[ "$sessions_stuck" -gt 0 ] && VERDICT="ATTENTION — stuck agent sessions"

HTML_ROWS=""
add_row() {
  HTML_ROWS+="<tr><td style='padding:6px 14px;border-bottom:1px solid #eee'>$1</td><td style='padding:6px 14px;border-bottom:1px solid #eee'><strong>$2</strong></td></tr>"
}
add_row "People registered (all time)" "$users_total ($users_active active, $users_new joined in the last 24h)"
add_row "Agent runs in the last 24 hours" "$turns_24h"
add_row "Model calls in the last 24 hours" "$steps_total total, $steps_failed failed"
add_row "Agent sessions stuck for over an hour" "$sessions_stuck"
[ -n "$never_activated" ] && add_row "Signed up but never ran an agent" "$never_activated"

ERR_SECTION=""
if [ "$steps_failed" -gt 0 ]; then
  ERR_SAMPLE=$(db "SELECT replaced_at || ' — ' || left(coalesce(error_message,'(no message)'), 160) FROM (SELECT created_at AS replaced_at, error_message FROM provider_steps WHERE created_at > now() - interval '24 hours' AND status <> 'success' ORDER BY created_at DESC LIMIT 5) s;")
  ERR_LIST=""
  while IFS= read -r line; do [ -n "$line" ] && ERR_LIST+="<li style='margin:4px 0'>$(printf '%s' "$line" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g')</li>"; done <<< "$ERR_SAMPLE"
  ERR_SECTION="<h3 style='margin:18px 0 6px;color:#b91c1c'>Latest agent errors</h3><ul style='padding-left:18px;margin:0'>$ERR_LIST</ul>"
fi

SUBJECT="Synappse daily health — $turns_24h agent runs, $steps_failed failed ($VERDICT)"

PAYLOAD=$(mktemp)
trap 'rm -f "$PAYLOAD"' EXIT
python3 - "$PAYLOAD" "$FROM" "$TO" "$SUBJECT" "$HTML_ROWS" "$ERR_SECTION" <<'PYEOF' 2>/dev/null || exit 0
import json, sys
path, from_addr, to, subject, rows, err_section = sys.argv[1:7]
html = f"""<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px">
<h2 style="margin:0 0 4px">Synappse daily health</h2>
<p style="margin:0 0 14px;color:#555">{subject.split(' — ', 1)[1]}</p>
<table style="border-collapse:collapse;font-size:14px">{rows}</table>
{err_section}
<p style="margin-top:18px;color:#888;font-size:12px">Sent automatically by the Synappse platform. Reply to this email or ping the lead session with any question.</p>
</div>"""
payload = {"from": from_addr, "to": [to], "subject": subject, "html": html}
open(path, "w").write(json.dumps(payload))
PYEOF

RESULT=$(curl -sS --max-time 30 -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  --data @"$PAYLOAD" 2>&1) || { log "send failed: $RESULT"; exit 1; }
log "report sent to $TO: $RESULT"
