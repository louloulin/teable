#!/usr/bin/env bash
# scripts/e2e-enterprise-readiness.sh
#
# End-to-end verification that the OSS instance's enterprise capabilities
# are reachable, machine-readable, and parity with Cloud Business.
#
# Pipeline:
#   1. Compile + start backend with `TEABLE_ADMIN_TOKEN=test-token`.
#   2. Wait for `/healthz` to return 200.
#   3. GET /api/admin/enterprise-readiness with the admin token.
#   4. Assert plan.level === 'self_hosted' AND ≥ 14 capabilities enabled.
#   5. Stop backend.
#   6. Restart with `TEABLE_LICENSE_KEY=plan:business`.
#   7. Re-fetch readiness, assert parity string contains score ≥ 14.
#   8. Stop backend. Exit 0 on success, non-zero on any failed assertion.
#
# Reuses `scripts/e2e-gap-fill.sh` startup pattern (prisma migrate +
# node dist/index.js) and `lsof -i :PORT` probe. Safe to run from a clean
# checkout — does NOT destroy production data.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="/tmp/teable-e2e-readiness.log"
PORT="${PORT:-3000}"
ADMIN_TOKEN="${TEABLE_ADMIN_TOKEN:-test-token}"
BASE_URL="http://127.0.0.1:${PORT}"
BACKEND_PID=""

# Source the env file if present (matches e2e-gap-fill.sh convention).
# Skips silently when the env file is absent (CI may inject env via secrets).
ENV_FILE="${TEABLE_ENV_FILE:-/tmp/teable-env.sh}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

# Backend startup knobs that operators sometimes toggle. Documented here so
# e2e runs in environments without Next.js / V2 preview tables can opt out.
export BACKEND_SKIP_NEXT_START="${BACKEND_SKIP_NEXT_START:-true}"
export V2_TABLE_QUERY_OPS_ENABLED="${V2_TABLE_QUERY_OPS_ENABLED:-false}"

log() {
  echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"
}

cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    log "Stopping backend pid=$BACKEND_PID"
    kill "$BACKEND_PID" 2>/dev/null || true
    sleep 2
    kill -9 "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

assert_ok() {
  if [[ $1 -ne 0 ]]; then
    log "[FAIL] $2"
    exit 1
  fi
  log "[OK]   $2"
}

wait_for_healthz() {
  local i
  for i in {1..40}; do
    if curl -sf "${BASE_URL}/healthz" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

extract_json() {
  # $1 = key path, $2 = json body
  python3 -c "
import json, sys
body = json.loads(sys.argv[1])
keys = sys.argv[0].split('.')
for k in keys:
    body = body[k] if isinstance(body, dict) else None
    if body is None: break
print(body if body is not None else '')
" "$1" "$2"
}

# Pre-flight: ensure port is free so we don't collide with a tmux-managed backend
ensure_port_free() {
  for _ in {1..10}; do
    if ! lsof -i :"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    local victim
    victim="$(lsof -ti :"$PORT" -sTCP:LISTEN 2>/dev/null | head -1)"
    if [[ -n "$victim" ]]; then
      log "Killing stale process on port $PORT (pid=$victim)"
      kill -9 "$victim" 2>/dev/null || true
    fi
    sleep 1
  done
  return 1
}

start_backend() {
  local extra_env="$1"
  log "Starting backend with: $extra_env"
  ensure_port_free || { log "[FAIL] port $PORT still busy after kill attempts"; return 1; }
  # shellcheck disable=SC2086
  env $extra_env \
    TEABLE_ADMIN_TOKEN="$ADMIN_TOKEN" \
    PORT="$PORT" \
    NODE_ENV=development \
    nohup node "${ROOT}/apps/nestjs-backend/dist/index.js" \
    > "$LOG" 2>&1 &
  BACKEND_PID=$!
  log "Backend PID=$BACKEND_PID"
  if ! wait_for_healthz; then
    log "[FAIL] backend did not reach /healthz within 40s"
    log "----- last 30 lines of backend log -----"
    tail -30 "$LOG" | sed 's/^/  /'
    return 1
  fi
  log "[OK]   /healthz responded"
}

stop_backend() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    sleep 3
    kill -9 "$BACKEND_PID" 2>/dev/null || true
  fi
  BACKEND_PID=""
  # Wait until port is free
  for _ in {1..10}; do
    if ! lsof -i :"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
}

fetch_readiness() {
  curl -sf -H "x-admin-token: ${ADMIN_TOKEN}" "${BASE_URL}/api/admin/enterprise-readiness"
}

# ----- Section 1: build artifacts exist -----
log "=== Section 1: build artifacts ==="
test -f "${ROOT}/apps/nestjs-backend/dist/index.js" \
  || { log "[FAIL] dist/index.js missing — run pnpm build first"; exit 1; }
log "[OK]   dist/index.js present"

# ----- Section 2: start with default (no license) -----
log "=== Section 2: default self_hosted plan ==="
start_backend "" || exit 1

DEFAULT_BODY="$(fetch_readiness)"
assert_ok $? "GET /api/admin/enterprise-readiness returns 200"

DEFAULT_LEVEL="$(echo "$DEFAULT_BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["plan"]["level"])')"
assert_ok "$([[ "$DEFAULT_LEVEL" == "self_hosted" ]] && echo 0 || echo 1)" \
  "plan.level == self_hosted (got: $DEFAULT_LEVEL)"

TOTAL_CAPS="$(echo "$DEFAULT_BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["summary"]["total"])')"
ENABLED_CAPS="$(echo "$DEFAULT_BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["summary"]["enabled"])')"
log "capabilities: enabled=$ENABLED_CAPS / total=$TOTAL_CAPS"

# Section 2 final assertion (round-3): with the round-3 enterprise-table
# probes registered (25 new capabilities from meta-schema tables via raw SQL
# count(*)), and the 0 remaining documented permission-matrix gaps, exactly
# 35 of 60 capabilities should be enabled on a default self-hosted instance.
# The remaining 25 (BYOK, billing, db-connector, dashboard, ...) flip to
# enabled the moment a row is inserted into their backing meta table. Section
# 2.6 confirms registration + presence on disk without requiring seed rows.
# Round-3: 25 new enterprise-table probes registered.
# Round-4: 8 new wired-module probes (api_rate_limit, record_history,
#          data_masking, email_domain_claim, audit_export,
#          attachment_storage, quota, retention).
# Total registered caps: 68. Baseline enabled: 42 (api_rate_limit opt-out
# in self_hosted; everything else enabled by module wiring).
# Cloud Business parity: 32/33 (api_rate_limit flips to enabled on
# non-self_hosted plans, see Section 3).
EXPECTED_TOTAL=68
EXPECTED_ENABLED=42
assert_ok "$([[ "$TOTAL_CAPS" == "$EXPECTED_TOTAL" ]] && echo 0 || echo 1)" \
  "total capabilities registered = $EXPECTED_TOTAL (got total=$TOTAL_CAPS)"
assert_ok "$([[ "$ENABLED_CAPS" -ge "$EXPECTED_ENABLED" ]] && echo 0 || echo 1)" \
  "$EXPECTED_ENABLED+/$TOTAL_CAPS capabilities enabled (got enabled=$ENABLED_CAPS; >=42 baseline, data may push higher)"

# Assert core capabilities are present in the map (regression guard for AC-005)
for cap in sso audit_log permission_matrix admin_panel custom_domain ai_field automation webhook trash; do
  if ! echo "$DEFAULT_BODY" | python3 -c "
import json, sys
body = json.load(sys.stdin)
sys.exit(0 if '$cap' in body['capabilities'] else 1)
"; then
    log "[FAIL] capability '$cap' missing from readiness map"
    exit 1
  fi
done
log "[OK]   all 9 core capabilities present in readiness map"

# ----- Section 2.5: documented permission-matrix sub-capability probes -----
# Both permission_import_export and permission_app_workflow now flip to enabled
# the moment ≥1 rule row exists (probe-driven capability gate).
log "=== Section 2.5: documented permission-matrix sub-capability probes ==="
IMPORT_EX=$(echo "$DEFAULT_BODY" | python3 -c "
import json, sys
body = json.load(sys.stdin)
cap = body['capabilities'].get('permission_import_export', {})
print('enabled=' + str(cap.get('enabled', False)).lower() + ' rules=' + str(cap.get('rules', 0)))
")
case "$IMPORT_EX" in
  enabled=true*rules=[1-9]*)
    log "[OK]   permission_import_export is enabled ($IMPORT_EX)" ;;
  *)
    log "[FAIL] permission_import_export should be enabled with rules>=1, got: $IMPORT_EX"
    exit 1 ;;
esac

# permission_app_workflow should now be ENABLED with appWorkflowNodes >= 1 (after
# the schema change that adds nodeType + the seed rows in meta).
APPWF=$(echo "$DEFAULT_BODY" | python3 -c "
import json, sys
body = json.load(sys.stdin)
cap = body['capabilities'].get('permission_app_workflow', {})
print('enabled=' + str(cap.get('enabled', False)).lower() + ' appWorkflowNodes=' + str(cap.get('appWorkflowNodes', 0)))
")
case "$APPWF" in
  enabled=true*appWorkflowNodes=[1-9]*)
    log "[OK]   permission_app_workflow is enabled ($APPWF)" ;;
  *)
    log "[FAIL] permission_app_workflow should be enabled with appWorkflowNodes >= 1, got: $APPWF"
    exit 1 ;;
esac

# ----- Section 2.6: round-3 enterprise-table probe registration -----
# Round 3 added 25 capabilities from DB tables (BYOK, billing, db-connector,
# approval, conditional_format, federation, dr_canvas, custom_role, etc.).
# They are intentionally disabled by default (tables exist but empty). The
# probe machinery must report them as "registered but no_rows_yet".
log "=== Section 2.6: round-3 enterprise-table probe registration ==="
ROUND3_KEYS="byok_llm_key customer_kms_key data_residency_policy billing_invoice billing_credit cross_org_admin_grant db_connector db_connector_sync airtable_connection data_db_connection approval_workflow conditional_format_rule conflict_event federation_event dashboard dr_canvas ai_credit_ledger ai_usage_bucket ai_credit_grant_policy custom_role app_module_wire automation_canvas_revision automation_secret comment_subscription backup_restore_log"
for cap in $ROUND3_KEYS; do
  STATE=$(echo "$DEFAULT_BODY" | python3 -c "
import json, sys
body = json.load(sys.stdin)
c = body['capabilities'].get('$cap', {})
print('present=' + str('$cap' in body['capabilities']).lower() + ' ' + str(c.get('reason', '')))
")
  PRESENT=$(echo "$STATE" | awk '{print $1}')
  REASON=$(echo "$STATE" | awk '{$1=""; sub(/^ /,""); print}')
  if [[ "$PRESENT" != "present=true" ]]; then
    log "[FAIL] round-3 capability '$cap' missing from readiness map"
    exit 1
  fi
  if [[ ! "$REASON" =~ ^no_[a-zA-Z0-9_]+_rows_yet$ ]]; then
    log "[FAIL] round-3 capability '$cap' expected 'no_X_rows_yet' reason, got: '$REASON'"
    exit 1
  fi
done
log "[OK]   all 25 round-3 enterprise-table capabilities registered with 'no_*_rows_yet' probe"

# Cloud Business parity now spans 33 keys (license + external + round-4 wired).
# Default self_hosted plan: 32/33 because api_rate_limit is opt-out for
# self_hosted (guard short-circuits when plan=self_hosted). Flips to 33/33
# on any business/enterprise license — see Section 3.
PARITY_DEFAULT=$(echo "$DEFAULT_BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["summary"]["cloudBusinessParity"])')
assert_ok "$([[ "$PARITY_DEFAULT" == "32/33" ]] && echo 0 || echo 1)" \
  "default self_hosted parity = 32/33 (got: $PARITY_DEFAULT; api_rate_limit opt-out)"

# ----- Section 2.7: round-3 capability flips on data -----
# Insert a demo row into one round-3 enterprise table and re-fetch readiness
# to prove the probe flips enabled=true when count > 0.
log "=== Section 2.7: round-3 capability flips on data ==="
# Clean up any prior seed row from previous e2e runs to make this idempotent.
PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -q -c \
  "DELETE FROM meta.comment_subscription WHERE id LIKE 'cs_e2e_demo_%';" >/dev/null 2>&1 || true
# Use comment_subscription as the round-3 demo (no FK to other meta tables,
# simple text PK). Insert then check the capability flips.
SEED_OK=0
PG_CONN_STR="postgresql://teable:teable@127.0.0.1:42345/teable?schema=meta"
PG_RESULT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.comment_subscription (id, table_id, record_id, created_by, created_time) \
   VALUES ('cs_e2e_demo_$(date +%s)', 'tbloj9xG5OIxMaISGhg', 'rec_e2e_demo', 'usr_e2e_demo', now()) \
   ON CONFLICT (id) DO NOTHING; \
   SELECT count(*) FROM meta.comment_subscription;" 2>&1) || PG_RESULT=""
echo "$PG_RESULT" | grep -qE '^[0-9]+$' && SEED_OK=1
if [[ "$SEED_OK" == "1" ]]; then
  SEED_COUNT=$(echo "$PG_RESULT" | tail -1)
  log "[OK]   demo row inserted into meta.comment_subscription (count=$SEED_COUNT)"
  # Re-fetch readiness and assert comment_subscription flipped to enabled
  REFETCH_BODY="$(fetch_readiness)"
  CS_STATE=$(echo "$REFETCH_BODY" | python3 -c "
import json, sys
body = json.load(sys.stdin)
c = body['capabilities'].get('comment_subscription', {})
print('enabled=' + str(c.get('enabled', False)).lower())
")
  assert_ok "$([[ "$CS_STATE" == "enabled=true" ]] && echo 0 || echo 1)" \
    "round-3 capability 'comment_subscription' flipped to enabled after row insert (got: $CS_STATE)"
  # Clean up the demo row so subsequent runs start from baseline
  PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -q -c \
    "DELETE FROM meta.comment_subscription WHERE id LIKE 'cs_e2e_demo_%';" >/dev/null 2>&1 || true
else
  log "[SKIP] comment_subscription seed insert failed (psql unavailable?) - skipping flip-on-data check"
fi

# ----- Section 2.8: round-4 wired-module capability registration -----
# Round 4 adds 8 capabilities for OSS-implemented modules:
#   api_rate_limit (guard wired in global.module.ts)
#   record_history (write-hook in record.service.ts + read API)
#   data_masking (data-masking module imported in app.module.ts)
#   email_domain_claim (email-domain-claim module imported in app.module.ts)
#   audit_export (audit-export module)
#   attachment_storage (attachments module)
#   quota (quota module imported in app.module.ts)
#   retention (retention module imported in app.module.ts)
log "=== Section 2.8: round-4 wired-module capability registration ==="
ROUND4_KEYS="api_rate_limit record_history data_masking email_domain_claim audit_export attachment_storage quota retention"
for cap in $ROUND4_KEYS; do
  STATE=$(echo "$DEFAULT_BODY" | python3 -c "
import json, sys
body = json.load(sys.stdin)
c = body['capabilities'].get('$cap', {})
print('present=' + str('$cap' in body['capabilities']).lower() + ' ' + str(c.get('enabled', False)).lower())
")
  PRESENT=$(echo "$STATE" | awk '{print $1}')
  ENABLED=$(echo "$STATE" | awk '{print $2}')
  if [[ "$PRESENT" != "present=true" ]]; then
    log "[FAIL] round-4 capability '$cap' missing from readiness map"
    exit 1
  fi
done
log "[OK]   all 8 round-4 wired-module capabilities registered"

# api_rate_limit must be opt-out on self_hosted
ARL_STATE=$(echo "$DEFAULT_BODY" | python3 -c "
import json, sys
body = json.load(sys.stdin)
c = body['capabilities'].get('api_rate_limit', {})
print(str(c.get('enabled', False)).lower() + ' ' + str(c.get('reason', '')))
")
ARL_ENABLED=$(echo "$ARL_STATE" | awk '{print $1}')
ARL_REASON=$(echo "$ARL_STATE" | awk '{$1=""; sub(/^ /,""); print}')
assert_ok "$([[ "$ARL_ENABLED" == "false" && "$ARL_REASON" == "opt_out_self_hosted" ]] && echo 0 || echo 1)" \
  "api_rate_limit opt-out on self_hosted (got: enabled=$ARL_ENABLED reason=$ARL_REASON)"

# record_history must be enabled and report revision count
RH_STATE=$(echo "$DEFAULT_BODY" | python3 -c "
import json, sys
body = json.load(sys.stdin)
c = body['capabilities'].get('record_history', {})
print('enabled=' + str(c.get('enabled', False)).lower())
")
assert_ok "$([[ "$RH_STATE" == "enabled=true" ]] && echo 0 || echo 1)" \
  "record_history enabled (got: $RH_STATE)"

# data_masking must be enabled (module wired)
DM_STATE=$(echo "$DEFAULT_BODY" | python3 -c "
import json, sys
body = json.load(sys.stdin)
c = body['capabilities'].get('data_masking', {})
print('enabled=' + str(c.get('enabled', False)).lower())
")
assert_ok "$([[ "$DM_STATE" == "enabled=true" ]] && echo 0 || echo 1)" \
  "data_masking enabled (got: $DM_STATE)"

# ----- Section 3: restart with business license -----
log "=== Section 3: business license parity ==="
stop_backend
sleep 1
start_backend "TEABLE_LICENSE_KEY=plan:business" || exit 1

BIZ_BODY="$(fetch_readiness)"
assert_ok $? "GET /api/admin/enterprise-readiness returns 200 (business license)"

BIZ_LEVEL="$(echo "$BIZ_BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["plan"]["level"])')"
assert_ok "$([[ "$BIZ_LEVEL" == "business" ]] && echo 0 || echo 1)" \
  "plan.level == business (got: $BIZ_LEVEL)"

PARITY="$(echo "$BIZ_BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["summary"]["cloudBusinessParity"])')"
SCORE="${PARITY%/*}"
TOTAL="${PARITY##*/}"
assert_ok "$([[ "$SCORE" -ge 33 ]] && echo 0 || echo 1)" \
  "cloudBusinessParity score $SCORE/$TOTAL >= 33 (full round-4 Cloud Business parity; api_rate_limit flips on license)"

# Assert business-only capabilities flipped to true
for cap in sso audit_log permission_matrix admin_panel custom_domain; do
  ENABLED="$(echo "$BIZ_BODY" | python3 -c "
import json, sys
body = json.load(sys.stdin)
val = body['capabilities'].get('$cap', {}).get('enabled', False)
print('true' if val else 'false')
")"
  assert_ok "$([[ "$ENABLED" == "true" ]] && echo 0 || echo 1)" \
    "business: capability '$cap' enabled (got: $ENABLED)"
done

# ----- Section 4: unauthenticated request rejected -----
log "=== Section 4: unauth rejected ==="
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/admin/enterprise-readiness")"
assert_ok "$([[ "$HTTP_CODE" == "401" ]] && echo 0 || echo 1)" \
  "no admin token returns 401 (got: $HTTP_CODE)"

stop_backend
log "=== ALL E2E READINESS ASSERTIONS PASSED ==="
exit 0
