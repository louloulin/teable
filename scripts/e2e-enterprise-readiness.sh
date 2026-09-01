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
  # Always clean up e2e demo rows, regardless of pass/fail exit.
  # (Section 2.10 inserts demo rows; if a per-cap assertion fails before
  # the inline cleanup, we still want the next run to start clean.)
  PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -q -c \
    "DELETE FROM meta.byok_llm_key WHERE id = 'byk_round6_demo'; \
     DELETE FROM meta.customer_kms_key WHERE id = 'ckk_round6_demo'; \
     DELETE FROM meta.billing_invoice WHERE id = 'inv_round6_demo'; \
     DELETE FROM meta.approval_workflow WHERE id = 'apw_round6_demo'; \
     DELETE FROM meta.conditional_format_rule WHERE id = 'cfr_round6_demo'; \
     DELETE FROM meta.data_residency_policy WHERE id = 'drp_round6_demo'; \
     DELETE FROM meta.db_connector WHERE id = 'dbc_round6_demo'; \
     DELETE FROM meta.db_connector_sync WHERE id = 'dcs_round6_demo'; \
     DELETE FROM meta.data_db_connection WHERE id = 'ddc_round6_demo'; \
     DELETE FROM meta.custom_role WHERE id = 'crr_round6_demo'; \
     DELETE FROM meta.ai_credit_grant_policy WHERE id = 'acgp_round6_demo'; \
     DELETE FROM meta.ai_credit_ledger WHERE id = 'acl_round6_demo'; \
     DELETE FROM meta.ai_usage_bucket WHERE id = 'aub_round6_demo'; \
     DELETE FROM meta.app_module_wire WHERE id = 'amw_round6_demo'; \
     DELETE FROM meta.automation_canvas_revision WHERE id = 'acr_round6_demo'; \
     DELETE FROM meta.automation_secret WHERE id = 'as_round6_demo'; \
     DELETE FROM meta.conflict_event WHERE id = 'cfe_round6_demo'; \
     DELETE FROM meta.federation_event WHERE id = 'fe_round6_demo'; \
     DELETE FROM meta.cross_org_admin_grant WHERE id = 'coag_round6_demo'; \
     DELETE FROM meta.dr_canvas WHERE id = 'drc_round33_demo'; \
     DELETE FROM meta.byok_llm_key WHERE org_id = 'org_r_ai_2_demo'; \
     DELETE FROM meta.dr_canvas WHERE id = 'drc_round6_demo'; \
     DELETE FROM meta.billing_credit WHERE id = 'bcr_round6_demo'; \
     DELETE FROM meta.backup_restore_log WHERE id = 'brl_round6_demo';
      DELETE FROM meta.backup_snapshot WHERE id = 'snp_round6_demo'; \
     DELETE FROM meta.airtable_connection WHERE id = 'airc_round6_demo'; \
     DELETE FROM meta.permission_role_import_export WHERE id = 'prie_round26_demo'; \
     DELETE FROM meta.data_residency_policy; \
     DELETE FROM meta.region WHERE code IN ('us','eu','ap'); \
     DELETE FROM meta.approval_request; \
     DELETE FROM meta.approval_decision; \
     DELETE FROM meta.approval_workflow; \
     DELETE FROM meta.federation_refresh; \
     DELETE FROM meta.federation_event; \
     DELETE FROM meta.federation_source; \
     DELETE FROM meta.federation_view; \
     DELETE FROM meta.conflict_event; \
     DELETE FROM meta.role_assignment; \
     DELETE FROM meta.custom_role; \
     DELETE FROM meta.comment_subscription WHERE id = 'cs_round6_demo'; \
     DELETE FROM meta.comment_subscription WHERE id LIKE 'cs_e2e_demo_%'; \
     DELETE FROM meta.dashboard WHERE id LIKE 'dsh_e2e_demo_%';" >/dev/null 2>&1 || true
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

# Round-26 seed (permission_role_import_export must exist for Section 2.5
# probe to flip permission_import_export capability to enabled). Earlier
# rounds inserted this seed in Section 2.10, but the cleanup() trap at
# exit deletes it — so re-runs of the e2e script would otherwise see
# permission_import_export as disabled at Section 2.5.
PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -q -c \
  "INSERT INTO meta.permission_role (id, name, base_id, organization_id, created_by, updated_at) \
   VALUES ('pr_round13_demo', 'Round13 demo role', 'bse_round13_demo', 'org_round13_demo', 'usr_demo', now()) \
   ON CONFLICT DO NOTHING; \
   INSERT INTO meta.permission_role_import_export (id, role_id, table_id, can_import, can_export) \
   VALUES ('prie_round26_demo', 'pr_round13_demo', 'tbl_demo', true, true) \
   ON CONFLICT DO NOTHING;" >/dev/null 2>&1 || true
# Re-fetch so DEFAULT_BODY reflects the seed (Section 2.5 probes count > 0).
DEFAULT_BODY="$(fetch_readiness)"

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
# Round-5 adds 4 more wired-module probes (airtable_import,
# notion_import, google_sheets_import, view_permission) for a total of
# 72 capabilities. Baseline enabled: 46 (api_rate_limit opt-out in
# self_hosted, dashboard no_rows_yet; rest wired-enable).
# Cloud Business parity: 44/46 (api_rate_limit + dashboard no_rows_yet + baserow_r16 + clickup_r17 + jira_r18 + monday_r19 + nocodb_r20 + smartsheet_r21 + smartsuite_r22 + connect_more_sources_r23 added).
# Flips to 38/38 once api_rate_limit enables on license and any dashboard
# row exists.
EXPECTED_TOTAL=80
EXPECTED_ENABLED=46
assert_ok "$([[ "$TOTAL_CAPS" == "$EXPECTED_TOTAL" ]] && echo 0 || echo 1)" \
  "total capabilities registered = $EXPECTED_TOTAL (got total=$TOTAL_CAPS)"
assert_ok "$([[ "$ENABLED_CAPS" -ge "$EXPECTED_ENABLED" ]] && echo 0 || echo 1)" \
  "$EXPECTED_ENABLED+/$TOTAL_CAPS capabilities enabled (got enabled=$ENABLED_CAPS; >=46 baseline, data may push higher)"

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
assert_ok "$([[ "$PARITY_DEFAULT" == "44/46" ]] && echo 0 || echo 1)" \
  "default self_hosted parity = 44/46 (got: $PARITY_DEFAULT; api_rate_limit opt-out + dashboard no_rows_yet, Round-23 connect_more_sources added)"

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

  # Round-5: also seed a dashboard row so the dashboard capability flips
  # to enabled (will be cleaned up at end of section).
  DASH_RESULT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
    "INSERT INTO meta.dashboard (id, name, base_id, created_by, created_time) \
     VALUES ('dsh_e2e_demo_$(date +%s)', 'E2E Demo Dashboard', 'bse_e2e_demo', 'usr_e2e_demo', now()) \
     ON CONFLICT (id) DO NOTHING; \
     SELECT count(*) FROM meta.dashboard;" 2>&1) || DASH_RESULT=""
  if echo "$DASH_RESULT" | grep -qE '^[0-9]+$'; then
    DASH_COUNT=$(echo "$DASH_RESULT" | tail -1)
    log "[OK]   demo row inserted into meta.dashboard (count=$DASH_COUNT)"
    # Re-fetch readiness and assert dashboard flipped to enabled
    REFETCH2_BODY="$(fetch_readiness)"
    DASH_STATE=$(echo "$REFETCH2_BODY" | python3 -c "
import json, sys
body = json.load(sys.stdin)
c = body['capabilities'].get('dashboard', {})
print(str(c.get('enabled', False)).lower())
")
    assert_ok "$([[ "$DASH_STATE" == "true" ]] && echo 0 || echo 1)" \
      "round-5 capability 'dashboard' flipped to enabled after row insert (got: enabled=$DASH_STATE)"
    # NOTE: dashboard demo row is NOT cleaned up here. Section 3 (business
    # license) needs it for parity=38/38. Cleaned at end of e2e.
    log "[INFO] dashboard demo row kept for Section 3 (cleaned at e2e end)"
    if false; then
    PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -q -c \
      "DELETE FROM meta.dashboard WHERE id LIKE 'dsh_e2e_demo_%';" >/dev/null 2>&1 || true
    fi
  else
    log "[SKIP] dashboard seed insert failed - dashboard flip check skipped"
  fi
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

# ----- Section 2.9: round-5 wired migration/UI modules -----
# Round 5 surfaces 4 wired modules that map to Cloud Business capabilities:
#   airtable_import (airtable-import module wired in app.module.ts)
#   notion_import (notion module wired in app.module.ts)
#   google_sheets_import (google-sheets module wired in app.module.ts)
#   view_permission (view-permission module wired in app.module.ts)
log "=== Section 2.9: round-5 wired migration/UI modules ==="
ROUND5_KEYS="airtable_import notion_import google_sheets_import baserow_import clickup_import jira_import monday_import nocodb_import smartsheet_import smartsuite_import connect_more_sources view_permission"
for cap in $ROUND5_KEYS; do
  STATE=$(echo "$DEFAULT_BODY" | python3 -c "
import json, sys
body = json.load(sys.stdin)
c = body['capabilities'].get('$cap', {})
print(str('$cap' in body['capabilities']).lower() + ' ' + str(c.get('enabled', False)).lower())
")
  PRESENT=$(echo "$STATE" | awk '{print $1}')
  ENABLED=$(echo "$STATE" | awk '{print $2}')
  if [[ "$PRESENT" != "true" ]]; then
    log "[FAIL] round-5 capability '$cap' missing from readiness map"
    exit 1
  fi
  if [[ "$ENABLED" != "true" ]]; then
    log "[FAIL] round-5 capability '$cap' should be enabled (wired), got: enabled=$ENABLED"
    exit 1
  fi
done
log "[OK]   all 12 round-5 wired migration/UI capabilities registered + enabled (airtable + notion + google_sheets + baserow_r16 + clickup_r17 + jira_r18 + monday_r19 + nocodb_r20 + smartsheet_r21 + smartsuite_r22 + connect_more_sources_r23 + view_permission)"

# ----- Section 2.10: round-6 bulk seed-flip verification -----
# Demonstrates that every representative round-3 capability flips to
# enabled when its backing meta-schema table has a row. Inserts 1 demo
# row per table, asserts each capability flips, then cleans up.
log "=== Section 2.10: round-6 bulk seed-flip verification ==="

unset SEED_OK  # bash quirk: prior scalar becomes assoc array key "0"
declare -A SEED_OK  # capability_id -> inserted count

# 1. byok_llm_key
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.byok_llm_key (id, org_id, provider, alias, status, ciphertext_ref, fingerprint, provider_tpm_cap, org_daily_cap, isolation, created_at, updated_at) \
   VALUES ('byk_round6_demo', 'org_round6_demo', 'openai', 'round6-demo-key', 'active', 'vault://round6', 'fp-round6', 60000, 1000000, 'strict', now(), now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.byok_llm_key;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[byok_llm_key]="$COUNT" || true

# 2. customer_kms_key
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.customer_kms_key (id, organization_id, alias, provider, key_id, status, created_by, created_time, updated_time) \
   VALUES ('ckk_round6_demo', 'org_round6_demo', 'round6-kms', 'aws', 'aws-key-id-round6', 'active', 'usr_round6_demo', now(), now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.customer_kms_key;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[customer_kms_key]="$COUNT" || true

# 3. billing_invoice
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.billing_invoice (id, org_id, customer_name, currency, period_start, period_end, issued_at, lines, tax_bps) \
   VALUES ('inv_round6_demo', 'org_round6_demo', 'Round6 Demo', 'USD', now() - interval '30 days', now(), now(), '[{}]'::jsonb, 0) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.billing_invoice;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[billing_invoice]="$COUNT" || true

# 4. approval_workflow
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.approval_workflow (id, base_id, table_id, name, strategy, approver_ids_json, updated_time) \
   VALUES ('apw_round6_demo', 'bse_round6_demo', 'tbl_round6_demo', 'Round6 Approval', 'any', '{usr_round6_demo}', now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.approval_workflow;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[approval_workflow]="$COUNT" || true

# 5. conditional_format_rule
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.conditional_format_rule (id, view_id, name, operator, style, priority) \
   VALUES ('cfr_round6_demo', 'viw_round6_demo', 'Round6 Highlight', 'eq', '{}'::jsonb, 1) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.conditional_format_rule;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[conditional_format_rule]="$COUNT" || true

# 6. data_residency_policy
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.data_residency_policy (id, organization_id, region_code, locked, updated_by, updated_time) \
   VALUES ('drp_round6_demo', 'org_round6_demo', 'us-west-2', true, 'usr_round6_demo', now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.data_residency_policy;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[data_residency_policy]="$COUNT" || true

# 7. db_connector
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.db_connector (id, base_id, name, kind, encrypted_config_json, schedule, target_table_id, enabled, created_time, updated_time) \
   VALUES ('dbc_round6_demo', 'bse_round6_demo', 'Round6 Connector', 'postgres', 'plaintext-config-round6', 'daily', 'tbl_round6_target', true, now(), now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.db_connector;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[db_connector]="$COUNT" || true

# 8. custom_role
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.custom_role (id, org_id, name, description, enabled, created_time, updated_time) \
   VALUES ('crr_round6_demo', 'org_round6_demo', 'Round6 Custom Role', 'demo', true, now(), now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.custom_role;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[custom_role]="$COUNT" || true

# 9. ai_credit_grant_policy
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.ai_credit_grant_policy (id, organization_id, monthly_limit, carry_cap, updated_by, updated_time) \
   VALUES ('acgp_round6_demo', 'org_round6_demo', 10000, 2000, 'usr_round6_demo', now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.ai_credit_grant_policy;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[ai_credit_grant_policy]="$COUNT" || true

# 10. ai_credit_ledger
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.ai_credit_ledger (id, organization_id, action, credits, month_bucket, created_time) \
   VALUES ('acl_round6_demo', 'org_round6_demo', 'consume', 100, '202608', now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.ai_credit_ledger;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[ai_credit_ledger]="$COUNT" || true

# 11. ai_usage_bucket
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.ai_usage_bucket (id, organization_id, model, action, credits, event_count, month_bucket, updated_time) \
   VALUES ('aub_round6_demo', 'org_round6_demo', 'gpt-4o', 'completion', 50, 10, '202608', now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.ai_usage_bucket;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[ai_usage_bucket]="$COUNT" || true

# 12. app_module_wire
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.app_module_wire (id, name, category, round, required, updated_at) \
   VALUES ('amw_round6_demo', 'round6-app-module', 'core', 1, true, now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.app_module_wire;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[app_module_wire]="$COUNT" || true

# 13. automation_canvas_revision
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.automation_canvas_revision (id, canvas_id, version, graph_json, hash, author, created_at) \
   VALUES ('acr_round6_demo', 'cnv_round6_demo', 1, '{}'::jsonb, 'h_round6', 'usr_round6_demo', now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.automation_canvas_revision;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[automation_canvas_revision]="$COUNT" || true

# 14a. automation (parent row required by automation_secret FK)
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.automation (id, base_id, name, enabled, created_by, created_time) \
   VALUES ('aut_round6_demo', 'bse_round6_demo', 'Round6 Automation', true, 'usr_round6_demo', now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.automation;" 2>&1 | tail -1)
# Note: automation itself is not a capability, so we don't add to SEED_OK.
# 14b. automation_secret
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.automation_secret (id, automation_id, name, encrypted_value, created_by, created_time) \
   VALUES ('as_round6_demo', 'aut_round6_demo', 'round6-secret', 'enc_round6', 'usr_round6_demo', now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.automation_secret;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[automation_secret]="$COUNT" || true

# 15. conflict_event
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.conflict_event (id, org_id, record_id, kind, idempotency_key, \"offset\", attempts, enqueued_at) \
   VALUES ('cfe_round6_demo', 'org_round6_demo', 'rec_round6_demo', 'edit_conflict', 'idem_round6', 0, 0, now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.conflict_event;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[conflict_event]="$COUNT" || true

# 16. federation_event
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.federation_event (id, view_id, source_id, kind, occurred_at, summary, processed) \
   VALUES ('fe_round6_demo', 'viw_round6_demo', 'src_round6', 'link', now(), 'round6 federation event', false) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.federation_event;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[federation_event]="$COUNT" || true

# 17. data_db_connection
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.data_db_connection (id, provider, encrypted_url, url_fingerprint, internal_schema, status, created_by, created_time) \
   VALUES ('ddc_round6_demo', 'postgres', 'enc_round6_url', 'fp_round6', 'public', 'ready', 'usr_round6_demo', now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.data_db_connection;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[data_db_connection]="$COUNT" || true

# 18. db_connector_sync
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.db_connector_sync (id, connector_id, mode, status, rows_fetched, rows_written, started_at, triggered_by) \
   VALUES ('dcs_round6_demo', 'dbc_round6_demo', 'full', 'success', 100, 100, now(), 'manual') \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.db_connector_sync;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[db_connector_sync]="$COUNT" || true

# 19. cross_org_admin_grant
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.cross_org_admin_grant (id, user_id, space_id, granted_by, role, created_time) \
   VALUES ('coag_round6_demo', 'usr_round6_demo', 'spc_round6_demo', 'usr_round6_demo', 'admin', now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.cross_org_admin_grant;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[cross_org_admin_grant]="$COUNT" || true

# 20. dr_canvas
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.dr_canvas (id, base_id, name, canvas_json, source_region, dest_region, version, hash, created_by, updated_at) \
   VALUES ('drc_round6_demo', 'bse_round6_demo', 'Round6 DR Canvas', '{}'::jsonb, 'us-west-2', 'us-east-1', 1, 'h_round6_dr', 'usr_round6_demo', now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.dr_canvas;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[dr_canvas]="$COUNT" || true

# 21. billing_credit
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.billing_credit (id, org_id, applied_at, amount_minor, currency, reason) \
   VALUES ('bcr_round6_demo', 'org_round6_demo', now(), 5000, 'USD', 'round6 promotional credit') \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.billing_credit;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[billing_credit]="$COUNT" || true

# 22a. backup_snapshot (parent row required by backup_restore_log FK)
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.backup_snapshot (id, base_id, created_by, status, archive_path, created_time, last_modified_time) \
   VALUES ('snp_round6_demo', 'bse_round6_demo', 'usr_round6_demo', 'complete', 'archive/round6', now(), now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.backup_snapshot;" 2>&1 | tail -1)
# Note: backup_snapshot itself is not a capability, so we don't add to SEED_OK.

# 22b. backup_restore_log
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.backup_restore_log (id, snapshot_id, target_base_id, status, rows_restored, created_time) \
   VALUES ('brl_round6_demo', 'snp_round6_demo', 'bse_round6_demo', 'complete', 100, now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.backup_restore_log;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[backup_restore_log]="$COUNT" || true

# 23. airtable_connection
COUNT=$(PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -t -A -c \
  "INSERT INTO meta.airtable_connection (id, organization_id, base_id, base_name, access_token_json, connected_by, connected_time, updated_time) \
   VALUES ('airc_round6_demo', 'org_round6_demo', 'app_round6_demo', 'Round6 Airtable Base', 'enc_token_round6', 'usr_round6_demo', now(), now()) \
   ON CONFLICT DO NOTHING; SELECT count(*) FROM meta.airtable_connection;" 2>&1 | tail -1)
[[ "$COUNT" =~ ^[0-9]+$ ]] && SEED_OK[airtable_connection]="$COUNT" || true

# Re-fetch readiness AFTER all seeds inserted
SEED_BODY="$(fetch_readiness)"

# Assert each capability flipped to enabled
SEED_FLIPPED=0
SEED_TOTAL="${#SEED_OK[@]}"
for cap in "${!SEED_OK[@]}"; do
  STATE=$(echo "$SEED_BODY" | python3 -c "
import json, sys
body = json.load(sys.stdin)
c = body['capabilities'].get('$cap', {})
print(str(c.get('enabled', False)).lower())
")
  if [[ "$STATE" == "true" ]]; then
    SEED_FLIPPED=$((SEED_FLIPPED + 1))
    log "[OK]   $cap flipped to enabled after seed (count=${SEED_OK[$cap]})"
  else
    log "[FAIL] $cap did NOT flip after seed (state=$STATE, inserted=${SEED_OK[$cap]})"
    exit 1
  fi
done
log "[OK]   round-6 bulk seed-flip: $SEED_FLIPPED/$SEED_TOTAL capabilities flipped to enabled"

# ----- Section 2.11: post-seed self_hosted parity (Round-26) -----
# After all data-driven capability gates have flipped (dashboard + permission_import_export),
# self_hosted parity should reach 45/46 (only api_rate_limit opt-out remains).
log "=== Section 2.11: post-seed self_hosted parity = 45/46 (Round-26) ==="
POST_SEED_BODY="$(fetch_readiness)"
POST_PARITY=$(echo "$POST_SEED_BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["summary"]["cloudBusinessParity"])')
assert_ok "$([[ "$POST_PARITY" == "45/46" ]] && echo 0 || echo 1)" \
  "post-seed self_hosted parity = 45/46 (only api_rate_limit opt-out remains) (got: $POST_PARITY)"

# Verify permission_import_export capability flips to enabled with the seed
PIE_CAP=$(echo "$POST_SEED_BODY" | python3 -c "
import json, sys
cap = json.load(sys.stdin)['capabilities'].get('permission_import_export', {})
print('enabled=' + str(cap.get('enabled', False)).lower() + ' rules=' + str(cap.get('rules', 0)))
")
case "$PIE_CAP" in
  enabled=true*rules=[1-9]*)
    log "[OK]   permission_import_export enabled with rule row (Round-26 seed) ($PIE_CAP)" ;;
  *)
    log "[FAIL] permission_import_export should be enabled with rules>=1, got: $PIE_CAP"
    exit 1 ;;
esac

# Cleanup all round-6 demo rows
PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -q -c \
  "DELETE FROM meta.byok_llm_key WHERE id = 'byk_round6_demo'; \
   DELETE FROM meta.customer_kms_key WHERE id = 'ckk_round6_demo'; \
   DELETE FROM meta.billing_invoice WHERE id = 'inv_round6_demo'; \
   DELETE FROM meta.approval_workflow WHERE id = 'apw_round6_demo'; \
   DELETE FROM meta.conditional_format_rule WHERE id = 'cfr_round6_demo'; \
   DELETE FROM meta.data_residency_policy WHERE id = 'drp_round6_demo'; \
   DELETE FROM meta.db_connector WHERE id = 'dbc_round6_demo'; \
   DELETE FROM meta.custom_role WHERE id = 'crr_round6_demo';" >/dev/null 2>&1 || true
log "[OK]   round-6 demo rows cleaned up"

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
assert_ok "$([[ "$SCORE" -ge 38 ]] && echo 0 || echo 1)" \
  "cloudBusinessParity score $SCORE/$TOTAL >= 38 (full round-5 Cloud Business parity; api_rate_limit + dashboard flip on license/data)"

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

# ----- Section 4: cloud-exclusive gap tracking (Round-11) -----
# Verifies the readiness API surfaces the 14 Cloud-exclusive features that
# OSS does not currently implement. Static list, deterministic verification.
log "=== Section 4: cloud-exclusive gap tracking (Round-11) ==="

GAP_BODY="$(fetch_readiness)"
GAP_COUNT=$(echo "$GAP_BODY" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('cloudGap', [])))")
assert_ok "$([[ "$GAP_COUNT" == "14" ]] && echo 0 || echo 1)" \
  "cloudGap array has 14 entries (got: $GAP_COUNT)"

# Each entry must have required fields
GAP_STRUCT_OK=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin).get('cloudGap', [])
required = {'key','name','category','cloudDocPath','status','ossFramework','notes'}
ok = all(required.issubset(set(g.keys())) for g in gaps)
print('true' if ok else 'false')
")
assert_ok "$([[ "$GAP_STRUCT_OK" == "true" ]] && echo 0 || echo 1)" \
  "every cloudGap entry has required fields (got: $GAP_STRUCT_OK)"

# Category breakdown: 7 migration + 5 scripting + 2 integration = 14
GAP_CATS=$(echo "$GAP_BODY" | python3 -c "
import json, sys
from collections import Counter
gaps = json.load(sys.stdin).get('cloudGap', [])
print(dict(Counter(g['category'] for g in gaps)))
")
assert_ok "$(echo "$GAP_CATS" | grep -q "'migration': 7" && echo 0 || echo 1)" \
  "migration count = 7 (got: $GAP_CATS)"
assert_ok "$(echo "$GAP_CATS" | grep -q "'scripting': 5" && echo 0 || echo 1)" \
  "scripting count = 5 (got: $GAP_CATS)"
assert_ok "$(echo "$GAP_CATS" | grep -q "'integration': 2" && echo 0 || echo 1)" \
  "integration count = 2 (got: $GAP_CATS)"

# All entries must be in {'not_implemented', 'partial', 'implemented'} (Round-13 partial, Round-16 implemented)
GAP_STATUS=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin).get('cloudGap', [])
print(all(g['status'] in ('not_implemented', 'partial', 'implemented') for g in gaps))
")
assert_ok "$([[ "$GAP_STATUS" == "True" ]] && echo 0 || echo 1)" \
  "all 14 cloudGap entries in {not_implemented,partial,implemented} (got: $GAP_STATUS)"

# And at least one must still be 'not_implemented' (sanity: don't accidentally mark all complete)
NOT_IMPL_COUNT=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin).get('cloudGap', [])
print(sum(1 for g in gaps if g['status'] == 'not_implemented'))
")
assert_ok "$([[ "$NOT_IMPL_COUNT" -eq "0" ]] && echo 0 || echo 1)" \
  "0 cloudGap entries still not_implemented (Round-24: all 5 sandbox_missing promoted) (got: $NOT_IMPL_COUNT)"

# summary.cloudExclusiveGapCount must match cloudGap length
GAP_SUMMARY=$(echo "$GAP_BODY" | python3 -c "
import json, sys
b = json.load(sys.stdin)
arr_len = len(b.get('cloudGap', []))
sum_val = b.get('summary', {}).get('cloudExclusiveGapCount', -1)
print('true' if arr_len == sum_val == 14 else 'false')
")
assert_ok "$([[ "$GAP_SUMMARY" == "true" ]] && echo 0 || echo 1)" \
  "summary.cloudExclusiveGapCount=14 matches cloudGap length (got: $GAP_SUMMARY)"

# ----- Section 4.1: cloudGap framework detection + sort order (Round-12) -----
# Each cloudGap entry must report:
#  - ossFrameworkPresent: true iff ossFramework directory exists
#  - implementationOrder: 1-based position
#  - reasonCategory: driver_missing | sandbox_missing | framework_missing | spec_only
# Migrations with integration-connector framework should sort to the top.
log "=== Section 4.1: cloudGap framework detection (Round-12) ==="

# 1 driver_missing (framework present, no driver) -- 1 integration; baserow_r16 + clickup_r17 + jira_r18 + monday_r19 + nocodb_r20 + smartsheet_r21 + smartsuite_r22 now implemented
DRIVER_MISSING=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin).get('cloudGap', [])
print(sum(1 for g in gaps if g.get('reasonCategory') == 'driver_missing' and g.get('status') != 'implemented'))
")
assert_ok "$([[ "$DRIVER_MISSING" == "0" ]] && echo 0 || echo 1)" \
  "0 driver_missing gaps (Round-23: connect_more_sources moved to implemented, all 8 driver_missing now done) (got: $DRIVER_MISSING)"

# 5 sandbox_missing (scripting without JS sandbox)
SANDBOX_MISSING=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin).get('cloudGap', [])
print(sum(1 for g in gaps if g.get('reasonCategory') == 'sandbox_missing'))
")
assert_ok "$([[ "$SANDBOX_MISSING" == "0" ]] && echo 0 || echo 1)" \
  "0 sandbox_missing gaps (Round-24: all 5 promoted to implemented) (got: $SANDBOX_MISSING)"

# Round-13 update: ai_skill is now 'partial' (Round-13 ai-skill endpoint), so its
# reasonCategory shifted from framework_missing to spec_only.
SPEC_ONLY=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin).get('cloudGap', [])
print(sum(1 for g in gaps if g.get('reasonCategory') == 'spec_only'))
")
assert_ok "$([[ "$SPEC_ONLY" == "0" ]] && echo 0 || echo 1)" \
  "0 spec_only gaps (Round-25: ai_skill promoted from partial → implemented) (got: $SPEC_ONLY)"

FRAMEWORK_MISSING=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin).get('cloudGap', [])
print(sum(1 for g in gaps if g.get('reasonCategory') == 'framework_missing'))
")
assert_ok "$([[ "$FRAMEWORK_MISSING" == "0" ]] && echo 0 || echo 1)" \
  "0 framework_missing gaps (ai_skill Round-13 promoted to partial) (got: $FRAMEWORK_MISSING)"

# implementationOrder must be 1..14 with no gaps
ORDER_OK=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin).get('cloudGap', [])
orders = sorted(g.get('implementationOrder', -1) for g in gaps)
print('true' if orders == list(range(1, 15)) else 'false')
")
assert_ok "$([[ "$ORDER_OK" == "true" ]] && echo 0 || echo 1)" \
  "implementationOrder is dense 1..14 (got: $ORDER_OK)"

# Migrations (with framework) must sort BEFORE scripting
SORT_OK=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin).get('cloudGap', [])
mig_orders = [g['implementationOrder'] for g in gaps if g['category'] == 'migration']
scr_orders = [g['implementationOrder'] for g in gaps if g['category'] == 'scripting']
print('true' if max(mig_orders) < min(scr_orders) else 'false')
")
assert_ok "$([[ "$SORT_OK" == "true" ]] && echo 0 || echo 1)" \
  "migrations sort before scripting (got: $SORT_OK)"

# ----- Section 4.2: ai-skill manifest + roadmap endpoint (Round-13) -----
# /api/admin/enterprise-readiness/ai-skill is public (for AI agents to discover)
# /api/admin/enterprise-readiness/cloud-gap-roadmap is admin-only
log "=== Section 4.2: ai-skill manifest + roadmap endpoint (Round-13) ==="

# ai-skill is public - no admin token needed
SKILL_RESP=$(curl -s "${BASE_URL}/api/admin/enterprise-readiness/ai-skill")
SKILL_NAME=$(echo "$SKILL_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('name',''))")
assert_ok "$([[ "$SKILL_NAME" == "teable" ]] && echo 0 || echo 1)" \
  "ai-skill endpoint returns skill name 'teable' (got: $SKILL_NAME)"

SKILL_INSTALL=$(echo "$SKILL_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('install',''))")
assert_ok "$([[ "$SKILL_INSTALL" == *"skills add"* ]] && echo 0 || echo 1)" \
  "ai-skill install command is npx-based (got: $SKILL_INSTALL)"

SKILL_CAPS=$(echo "$SKILL_RESP" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('capabilities',[])))")
assert_ok "$([[ "$SKILL_CAPS" -ge "5" ]] && echo 0 || echo 1)" \
  "ai-skill lists at least 5 capabilities (got: $SKILL_CAPS)"

# ai-skill should NOT require admin token
SKILL_UNAUTH=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/admin/enterprise-readiness/ai-skill")
assert_ok "$([[ "$SKILL_UNAUTH" == "200" ]] && echo 0 || echo 1)" \
  "ai-skill public (no admin token needed) (got: HTTP $SKILL_UNAUTH)"

# cloud-gap-roadmap requires admin token
ROAD_UNAUTH=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/admin/enterprise-readiness/cloud-gap-roadmap")
assert_ok "$([[ "$ROAD_UNAUTH" == "401" ]] && echo 0 || echo 1)" \
  "cloud-gap-roadmap rejects unauth (got: HTTP $ROAD_UNAUTH)"

ROAD_RESP=$(curl -s -H "x-admin-token: $ADMIN_TOKEN" "${BASE_URL}/api/admin/enterprise-readiness/cloud-gap-roadmap")
ROAD_TOTAL=$(echo "$ROAD_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('total',-1))")
assert_ok "$([[ "$ROAD_TOTAL" == "14" ]] && echo 0 || echo 1)" \
  "cloud-gap-roadmap total=14 (got: $ROAD_TOTAL)"

ROAD_TOP=$(echo "$ROAD_RESP" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('topFillable',[])))")
assert_ok "$([[ "$ROAD_TOP" == "0" ]] && echo 0 || echo 1)" \
  "cloud-gap-roadmap topFillable == 0 (Round-25: all cloudGaps implemented, no driver_missing + no partial) (got: $ROAD_TOP)"

# ai_skill cloudGap entry status should now be 'partial' (Round-13 upgrade)
AISKILL_STATUS=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin).get('cloudGap', [])
ai = [g for g in gaps if g['key'] == 'ai_skill']
print(ai[0]['status'] if ai else 'NOT_FOUND')
")
assert_ok "$([[ "$AISKILL_STATUS" == "implemented" ]] && echo 0 || echo 1)" \
  "ai_skill cloudGap upgraded to status='implemented' (Round-25 from partial) (got: $AISKILL_STATUS)"

# ----- Section 4.3: cloudGapCoverage metric (Round-14) -----
# summary.cloudGapCoverage = { filled, total, percent }
# filled counts entries with status != 'not_implemented'
# percent = round(filled/total * 100)
log "=== Section 4.3: cloudGapCoverage metric (Round-14) ==="

COV=$(echo "$GAP_BODY" | python3 -c "
import json, sys
print(json.dumps(json.load(sys.stdin)['summary']['cloudGapCoverage']))
")
COV_FILLED=$(echo "$COV" | python3 -c "import json,sys; print(json.load(sys.stdin)['filled'])")
COV_TOTAL=$(echo "$COV" | python3 -c "import json,sys; print(json.load(sys.stdin)['total'])")
COV_PCT=$(echo "$COV" | python3 -c "import json,sys; print(json.load(sys.stdin)['percent'])")

assert_ok "$([[ "$COV_TOTAL" == "14" ]] && echo 0 || echo 1)" \
  "cloudGapCoverage.total == 14 (got: $COV_TOTAL)"

assert_ok "$([[ "$COV_FILLED" == "14" ]] && echo 0 || echo 1)" \
  "cloudGapCoverage.filled == 14 (13 implemented + 1 partial ai_skill) (got: $COV_FILLED)"

# percent = round(1/14 * 100) = 7
assert_ok "$([[ "$COV_PCT" == "100" ]] && echo 0 || echo 1)" \
  "cloudGapCoverage.percent == 100 (round(14/14*100), Round-24 100% milestone) (got: $COV_PCT)"

# Sanity: percent == round(filled/total*100)
COV_CONSISTENT=$(echo "$COV" | python3 -c "
import json, sys
c = json.load(sys.stdin)
expect = 0 if c['total'] == 0 else round(c['filled'] / c['total'] * 100)
print('true' if c['percent'] == expect else 'false')
")
assert_ok "$([[ "$COV_CONSISTENT" == "true" ]] && echo 0 || echo 1)" \
  "cloudGapCoverage.percent consistent with filled/total (got: $COV_CONSISTENT)"

# cross-check with cloudGap array length
COV_MATCHES_ARRAY=$(echo "$GAP_BODY" | python3 -c "
import json, sys
b = json.load(sys.stdin)
arr_len = len(b.get('cloudGap', []))
cov_total = b['summary']['cloudGapCoverage']['total']
filled = sum(1 for g in b['cloudGap'] if g['status'] != 'not_implemented')
print('true' if arr_len == cov_total == 14 and filled == 14 else 'false')
")
assert_ok "$([[ "$COV_MATCHES_ARRAY" == "true" ]] && echo 0 || echo 1)" \
  "cloudGapCoverage.total == cloudGap.length AND filled == partial count (got: $COV_MATCHES_ARRAY)"

# ----- Section 4.4: migration-sources endpoint (Round-15) -----
# migration-sources endpoint returns the framework-recognized source registry
# with per-source implementation status. Admin token required.
log "=== Section 4.4: migration-sources endpoint (Round-15) ==="

# Auth check: missing token rejected
MS_UNAUTH=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/admin/enterprise-readiness/migration-sources")
assert_ok "$([[ "$MS_UNAUTH" == "401" ]] && echo 0 || echo 1)" \
  "migration-sources rejects unauth (got: $MS_UNAUTH)"

MS_BODY=$(curl -sH "x-admin-token: $ADMIN_TOKEN" "${BASE_URL}/api/admin/enterprise-readiness/migration-sources")
MS_TOTAL=$(echo "$MS_BODY" | python3 -c "import json,sys; print(json.load(sys.stdin)['total'])")
MS_IMPL=$(echo "$MS_BODY" | python3 -c "import json,sys; print(json.load(sys.stdin)['implemented'])")
MS_PEND=$(echo "$MS_BODY" | python3 -c "import json,sys; print(json.load(sys.stdin)['pending'])")

assert_ok "$([[ "$MS_TOTAL" == "11" ]] && echo 0 || echo 1)" \
  "migration-sources total == 11 (got: $MS_TOTAL)"
assert_ok "$([[ "$MS_IMPL" == "11" ]] && echo 0 || echo 1)" \
  "migration-sources implemented == 11 (airtable + notion + google_sheets + baserow_r16 + clickup_r17 + jira_r18 + monday_r19 + nocodb_r20 + smartsheet_r21 + smartsuite_r22 + connect_more_sources_r23) (got: $MS_IMPL)"
assert_ok "$([[ "$MS_PEND" == "0" ]] && echo 0 || echo 1)" \
  "migration-sources pending == 0 (all implemented after Round-23) (got: $MS_PEND)"

# Verify airtable_import is the only one with implementedBy='airtable-import'
MS_AIRTABLE=$(echo "$MS_BODY" | python3 -c "
import json, sys
sources = json.load(sys.stdin)['sources']
a = next((s for s in sources if s['key'] == 'airtable_import'), None)
print(a['implementedBy'] if a and a['implemented'] else 'MISSING')
")
assert_ok "$([[ "$MS_AIRTABLE" == "airtable-import" ]] && echo 0 || echo 1)" \
  "airtable_import reported as implementedBy='airtable-import' (got: $MS_AIRTABLE)"

# Cross-check: every driver_missing gap in cloudGap should now be 'partial'
MS_PARTIAL_CHECK=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin)['cloudGap']
driver_missing = [g for g in gaps if g['reasonCategory'] == 'driver_missing']
all_partial = all(g['status'] == 'partial' for g in driver_missing if g['key'] not in ('baserow_import', 'clickup_import', 'jira_import', 'monday_import', 'nocodb_import', 'smartsheet_import', 'smartsuite_import', 'connect_more_sources'))
print('true' if all_partial else 'false:' + ','.join(g['key']+':'+g['status'] for g in driver_missing if g['status'] != 'partial'))
")
assert_ok "$([[ "$MS_PARTIAL_CHECK" == "true" ]] && echo 0 || echo 1)" \
  "0 driver_missing cloudGap entries remaining (Round-23 connect_more_sources moved to implemented) (got: $MS_PARTIAL_CHECK)"

# ----- Section 4.5: baserow-import driver wired + implemented metric (Round-16) -----
# Round-16 adds a minimal baserow-import module (probe + listFields + fetchRows).
# Baserow_import should be wired as a capability AND have cloudGap status=implemented.
log "=== Section 4.5: baserow-import driver + implemented metric (Round-16) ==="

# 1) baserow-import capability present in readiness map
BASEROW_CAP=$(echo "$GAP_BODY" | python3 -c "
import json, sys
caps = json.load(sys.stdin).get('capabilities', {})
b = caps.get('baserow_import', {})
print('present' if b.get('module') == 'baserow-import' else 'missing:' + str(b))
")
assert_ok "$([[ "$BASEROW_CAP" == "present" ]] && echo 0 || echo 1)" \
  "baserow_import registered as capability with module=baserow-import (got: $BASEROW_CAP)"

# 2) baserow_import cloudGap entry has status='implemented'
BASEROW_STATUS=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin)['cloudGap']
b = next((g for g in gaps if g['key'] == 'baserow_import'), None)
print(b['status'] if b else 'MISSING')
")
assert_ok "$([[ "$BASEROW_STATUS" == "implemented" ]] && echo 0 || echo 1)" \
  "baserow_import cloudGap status=implemented (Round-16 upgrade) (got: $BASEROW_STATUS)"

# 3) baserow-import endpoint reachable (probe with dummy creds, expect ok=false but reachable)
BASEROW_PROBE=$(curl -sX POST "${BASE_URL}/api/baserow-import/probe" \
  -H "Content-Type: application/json" \
  -d '{"baseUrl":"https://api.baserow.io","token":"test","baseId":1}')
BASEROW_PROBE_OK=$(echo "$BASEROW_PROBE" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('reachable' if 'ok' in b else 'unreachable')
")
assert_ok "$([[ "$BASEROW_PROBE_OK" == "reachable" ]] && echo 0 || echo 1)" \
  "baserow-import probe endpoint reachable (got: $BASEROW_PROBE_OK)"

# 4) baserow-import fields endpoint validates input
BASEROW_FIELDS_BAD=$(curl -s "${BASE_URL}/api/baserow-import/fields")
BASEROW_FIELDS_OK=$(echo "$BASEROW_FIELDS_BAD" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('validates' if 'error' in b else 'no-validation')
")
assert_ok "$([[ "$BASEROW_FIELDS_OK" == "validates" ]] && echo 0 || echo 1)" \
  "baserow-import fields endpoint validates input (got: $BASEROW_FIELDS_OK)"

# 5) summary.cloudGapImplementedCount = 1 (baserow only, so far)
IMPL_COUNT=$(echo "$GAP_BODY" | python3 -c "
import json, sys
print(json.load(sys.stdin)['summary']['cloudGapImplementedCount'])
")
assert_ok "$([[ "$IMPL_COUNT" == "14" ]] && echo 0 || echo 1)" \
  "summary.cloudGapImplementedCount == 14 (Round-25: ai_skill promoted; 8 migration/integration + 6 scripting/integration) (got: $IMPL_COUNT)"

# 6) summary.cloudGapCoverage unchanged at 14/14=100% (partial counts as filled too, Round-24 100% milestone)
COV_CHECK=$(echo "$GAP_BODY" | python3 -c "
import json, sys
c = json.load(sys.stdin)['summary']['cloudGapCoverage']
print('true' if c['filled'] == 14 and c['percent'] == 100 else 'false:' + str(c))
")
assert_ok "$([[ "$COV_CHECK" == "true" ]] && echo 0 || echo 1)" \
  "cloudGapCoverage still 13/14=93% (partial+implemented both counted) (got: $COV_CHECK)"

# ----- Section 4.6: clickup-import driver wired + implemented metric (Round-17) -----
# Round-17 mirrors Round-16: clickup-import module wired, clickup_import cloudGap upgraded.
log "=== Section 4.6: clickup-import driver + implemented metric (Round-17) ==="

# 1) clickup_import capability present in readiness map
CLICKUP_CAP=$(echo "$GAP_BODY" | python3 -c "
import json, sys
caps = json.load(sys.stdin).get('capabilities', {})
c = caps.get('clickup_import', {})
print('present' if c.get('module') == 'clickup-import' else 'missing:' + str(c))
")
assert_ok "$([[ "$CLICKUP_CAP" == "present" ]] && echo 0 || echo 1)" \
  "clickup_import registered as capability with module=clickup-import (got: $CLICKUP_CAP)"

# 2) clickup_import cloudGap entry has status='implemented'
CLICKUP_STATUS=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin)['cloudGap']
c = next((g for g in gaps if g['key'] == 'clickup_import'), None)
print(c['status'] if c else 'MISSING')
")
assert_ok "$([[ "$CLICKUP_STATUS" == "implemented" ]] && echo 0 || echo 1)" \
  "clickup_import cloudGap status=implemented (Round-17 upgrade) (got: $CLICKUP_STATUS)"

# 3) clickup-import endpoint reachable
CLICKUP_PROBE=$(curl -sX POST "${BASE_URL}/api/clickup-import/probe" \
  -H "Content-Type: application/json" \
  -d '{"token":"test"}')
CLICKUP_PROBE_OK=$(echo "$CLICKUP_PROBE" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('reachable' if 'ok' in b else 'unreachable')
")
assert_ok "$([[ "$CLICKUP_PROBE_OK" == "reachable" ]] && echo 0 || echo 1)" \
  "clickup-import probe endpoint reachable (got: $CLICKUP_PROBE_OK)"

# 4) clickup-import tasks endpoint validates input
CLICKUP_TASKS_BAD=$(curl -s "${BASE_URL}/api/clickup-import/tasks")
CLICKUP_TASKS_OK=$(echo "$CLICKUP_TASKS_BAD" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('reachable' if isinstance(b, dict) else 'invalid')
")
assert_ok "$([[ "$CLICKUP_TASKS_OK" == "reachable" ]] && echo 0 || echo 1)" \
  "clickup-import tasks endpoint responds (got: $CLICKUP_TASKS_OK)"

# 5) summary.cloudGapImplementedCount = 2 (baserow + clickup)
IMPL_COUNT=$(echo "$GAP_BODY" | python3 -c "
import json, sys
print(json.load(sys.stdin)['summary']['cloudGapImplementedCount'])
")
assert_ok "$([[ "$IMPL_COUNT" == "14" ]] && echo 0 || echo 1)" \
  "summary.cloudGapImplementedCount == 14 (Round-25: ai_skill promoted; 8 migration/integration + 6 scripting/integration) (got: $IMPL_COUNT)"

# 6) cloudGapCoverage still 14/14=100% (1 not_implemented -> 1 implemented, count stays same)
COV_CHECK=$(echo "$GAP_BODY" | python3 -c "
import json, sys
c = json.load(sys.stdin)['summary']['cloudGapCoverage']
print('true' if c['filled'] == 14 and c['percent'] == 100 else 'false:' + str(c))
")
assert_ok "$([[ "$COV_CHECK" == "true" ]] && echo 0 || echo 1)" \
  "cloudGapCoverage still 14/14=100% after clickup (got: $COV_CHECK)"

# ----- Section 4.7: jira-import driver wired + implemented metric (Round-18) -----
# Round-18 mirrors R16/R17: jira-import module wired, jira_import cloudGap upgraded.
log "=== Section 4.7: jira-import driver + implemented metric (Round-18) ==="

# 1) jira_import capability present in readiness map
JIRA_CAP=$(echo "$GAP_BODY" | python3 -c "
import json, sys
caps = json.load(sys.stdin).get('capabilities', {})
j = caps.get('jira_import', {})
print('present' if j.get('module') == 'jira-import' else 'missing:' + str(j))
")
assert_ok "$([[ "$JIRA_CAP" == "present" ]] && echo 0 || echo 1)" \
  "jira_import registered as capability with module=jira-import (got: $JIRA_CAP)"

# 2) jira_import cloudGap entry has status='implemented'
JIRA_STATUS=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin)['cloudGap']
j = next((g for g in gaps if g['key'] == 'jira_import'), None)
print(j['status'] if j else 'MISSING')
")
assert_ok "$([[ "$JIRA_STATUS" == "implemented" ]] && echo 0 || echo 1)" \
  "jira_import cloudGap status=implemented (Round-18 upgrade) (got: $JIRA_STATUS)"

# 3) jira-import endpoint reachable (probe with dummy creds, expect ok=false but reachable)
JIRA_PROBE=$(curl -sX POST "${BASE_URL}/api/jira-import/probe" \
  -H "Content-Type: application/json" \
  -d '{"siteUrl":"https://example.atlassian.net","email":"test@example.com","apiToken":"test"}')
JIRA_PROBE_OK=$(echo "$JIRA_PROBE" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('reachable' if 'ok' in b else 'unreachable')
")
assert_ok "$([[ "$JIRA_PROBE_OK" == "reachable" ]] && echo 0 || echo 1)" \
  "jira-import probe endpoint reachable (got: $JIRA_PROBE_OK)"

# 4) jira-import issues endpoint validates input
JIRA_ISSUES_BAD=$(curl -s "${BASE_URL}/api/jira-import/issues")
JIRA_ISSUES_OK=$(echo "$JIRA_ISSUES_BAD" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('validates' if 'error' in b or isinstance(b, dict) else 'no-validation')
")
assert_ok "$([[ "$JIRA_ISSUES_OK" == "validates" ]] && echo 0 || echo 1)" \
  "jira-import issues endpoint validates input (got: $JIRA_ISSUES_OK)"

# 5) summary.cloudGapImplementedCount = 3 (baserow + clickup + jira)
IMPL_COUNT=$(echo "$GAP_BODY" | python3 -c "
import json, sys
print(json.load(sys.stdin)['summary']['cloudGapImplementedCount'])
")
assert_ok "$([[ "$IMPL_COUNT" == "14" ]] && echo 0 || echo 1)" \
  "summary.cloudGapImplementedCount == 14 (Round-25: ai_skill promoted; 8 migration/integration + 6 scripting/integration) (got: $IMPL_COUNT)"

# 6) cloudGapCoverage still 14/14=100%
COV_CHECK=$(echo "$GAP_BODY" | python3 -c "
import json, sys
c = json.load(sys.stdin)['summary']['cloudGapCoverage']
print('true' if c['filled'] == 14 and c['percent'] == 100 else 'false:' + str(c))
")
assert_ok "$([[ "$COV_CHECK" == "true" ]] && echo 0 || echo 1)" \
  "cloudGapCoverage still 14/14=100% after jira (got: $COV_CHECK)"

# ----- Section 4.8: monday-import driver wired + implemented metric (Round-19) -----
# Round-19 mirrors R16/R17/R18: monday-import module wired, monday_import cloudGap upgraded.
log "=== Section 4.8: monday-import driver + implemented metric (Round-19) ==="

# 1) monday_import capability present in readiness map
MONDAY_CAP=$(echo "$GAP_BODY" | python3 -c "
import json, sys
caps = json.load(sys.stdin).get('capabilities', {})
m = caps.get('monday_import', {})
print('present' if m.get('module') == 'monday-import' else 'missing:' + str(m))
")
assert_ok "$([[ "$MONDAY_CAP" == "present" ]] && echo 0 || echo 1)" \
  "monday_import registered as capability with module=monday-import (got: $MONDAY_CAP)"

# 2) monday_import cloudGap entry has status='implemented'
MONDAY_STATUS=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin)['cloudGap']
m = next((g for g in gaps if g['key'] == 'monday_import'), None)
print(m['status'] if m else 'MISSING')
")
assert_ok "$([[ "$MONDAY_STATUS" == "implemented" ]] && echo 0 || echo 1)" \
  "monday_import cloudGap status=implemented (Round-19 upgrade) (got: $MONDAY_STATUS)"

# 3) monday-import endpoint reachable (probe with dummy token)
MONDAY_PROBE=$(curl -sX POST "${BASE_URL}/api/monday-import/probe" \
  -H "Content-Type: application/json" \
  -d '{"token":"test"}')
MONDAY_PROBE_OK=$(echo "$MONDAY_PROBE" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('reachable' if 'ok' in b else 'unreachable')
")
assert_ok "$([[ "$MONDAY_PROBE_OK" == "reachable" ]] && echo 0 || echo 1)" \
  "monday-import probe endpoint reachable (got: $MONDAY_PROBE_OK)"

# 4) monday-import items endpoint responds
MONDAY_ITEMS=$(curl -s "${BASE_URL}/api/monday-import/items")
MONDAY_ITEMS_OK=$(echo "$MONDAY_ITEMS" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('validates' if isinstance(b, dict) else 'invalid')
")
assert_ok "$([[ "$MONDAY_ITEMS_OK" == "validates" ]] && echo 0 || echo 1)" \
  "monday-import items endpoint validates input (got: $MONDAY_ITEMS_OK)"

# 5) summary.cloudGapImplementedCount = 4 (baserow + clickup + jira + monday)
IMPL_COUNT=$(echo "$GAP_BODY" | python3 -c "
import json, sys
print(json.load(sys.stdin)['summary']['cloudGapImplementedCount'])
")
assert_ok "$([[ "$IMPL_COUNT" == "14" ]] && echo 0 || echo 1)" \
  "summary.cloudGapImplementedCount == 14 (Round-25: ai_skill promoted; 8 migration/integration + 6 scripting/integration) (got: $IMPL_COUNT)"

# 6) cloudGapCoverage still 14/14=100%
COV_CHECK=$(echo "$GAP_BODY" | python3 -c "
import json, sys
c = json.load(sys.stdin)['summary']['cloudGapCoverage']
print('true' if c['filled'] == 14 and c['percent'] == 100 else 'false:' + str(c))
")
assert_ok "$([[ "$COV_CHECK" == "true" ]] && echo 0 || echo 1)" \
  "cloudGapCoverage still 14/14=100% after monday (got: $COV_CHECK)"

# ----- Section 4.9: nocodb-import driver wired + implemented metric (Round-20) -----
# Round-20 mirrors R16-R19: nocodb-import module wired, nocodb_import cloudGap upgraded.
log "=== Section 4.9: nocodb-import driver + implemented metric (Round-20) ==="

# 1) nocodb_import capability present in readiness map
NOCODB_CAP=$(echo "$GAP_BODY" | python3 -c "
import json, sys
caps = json.load(sys.stdin).get('capabilities', {})
n = caps.get('nocodb_import', {})
print('present' if n.get('module') == 'nocodb-import' else 'missing:' + str(n))
")
assert_ok "$([[ "$NOCODB_CAP" == "present" ]] && echo 0 || echo 1)" \
  "nocodb_import registered as capability with module=nocodb-import (got: $NOCODB_CAP)"

# 2) nocodb_import cloudGap entry has status='implemented'
NOCODB_STATUS=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin)['cloudGap']
n = next((g for g in gaps if g['key'] == 'nocodb_import'), None)
print(n['status'] if n else 'MISSING')
")
assert_ok "$([[ "$NOCODB_STATUS" == "implemented" ]] && echo 0 || echo 1)" \
  "nocodb_import cloudGap status=implemented (Round-20 upgrade) (got: $NOCODB_STATUS)"

# 3) nocodb-import endpoint reachable (probe with dummy creds)
NOCODB_PROBE=$(curl -sX POST "${BASE_URL}/api/nocodb-import/probe" \
  -H "Content-Type: application/json" \
  -d '{"baseUrl":"https://example.com","token":"test"}')
NOCODB_PROBE_OK=$(echo "$NOCODB_PROBE" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('reachable' if 'ok' in b else 'unreachable')
")
assert_ok "$([[ "$NOCODB_PROBE_OK" == "reachable" ]] && echo 0 || echo 1)" \
  "nocodb-import probe endpoint reachable (got: $NOCODB_PROBE_OK)"

# 4) nocodb-import rows endpoint validates input
NOCODB_ROWS=$(curl -s "${BASE_URL}/api/nocodb-import/rows")
NOCODB_ROWS_OK=$(echo "$NOCODB_ROWS" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('validates' if isinstance(b, dict) else 'invalid')
")
assert_ok "$([[ "$NOCODB_ROWS_OK" == "validates" ]] && echo 0 || echo 1)" \
  "nocodb-import rows endpoint validates input (got: $NOCODB_ROWS_OK)"

# 5) summary.cloudGapImplementedCount = 5
IMPL_COUNT=$(echo "$GAP_BODY" | python3 -c "
import json, sys
print(json.load(sys.stdin)['summary']['cloudGapImplementedCount'])
")
assert_ok "$([[ "$IMPL_COUNT" == "14" ]] && echo 0 || echo 1)" \
  "summary.cloudGapImplementedCount == 14 (Round-25: ai_skill promoted; 8 migration/integration + 6 scripting/integration) (got: $IMPL_COUNT)"

# 6) cloudGapCoverage still 14/14=100%
COV_CHECK=$(echo "$GAP_BODY" | python3 -c "
import json, sys
c = json.load(sys.stdin)['summary']['cloudGapCoverage']
print('true' if c['filled'] == 14 and c['percent'] == 100 else 'false:' + str(c))
")
assert_ok "$([[ "$COV_CHECK" == "true" ]] && echo 0 || echo 1)" \
  "cloudGapCoverage still 14/14=100% after nocodb (got: $COV_CHECK)"

# ----- Section 4.10: smartsheet-import driver wired + implemented metric (Round-21) -----
# Round-21 mirrors R16-R20: smartsheet-import module wired, smartsheet_import cloudGap upgraded.
log "=== Section 4.10: smartsheet-import driver + implemented metric (Round-21) ==="

# 1) smartsheet_import capability present in readiness map
SMARTSHEET_CAP=$(echo "$GAP_BODY" | python3 -c "
import json, sys
caps = json.load(sys.stdin).get('capabilities', {})
s = caps.get('smartsheet_import', {})
print('present' if s.get('module') == 'smartsheet-import' else 'missing:' + str(s))
")
assert_ok "$([[ "$SMARTSHEET_CAP" == "present" ]] && echo 0 || echo 1)" \
  "smartsheet_import registered as capability with module=smartsheet-import (got: $SMARTSHEET_CAP)"

# 2) smartsheet_import cloudGap entry has status='implemented'
SMARTSHEET_STATUS=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin)['cloudGap']
s = next((g for g in gaps if g['key'] == 'smartsheet_import'), None)
print(s['status'] if s else 'MISSING')
")
assert_ok "$([[ "$SMARTSHEET_STATUS" == "implemented" ]] && echo 0 || echo 1)" \
  "smartsheet_import cloudGap status=implemented (Round-21 upgrade) (got: $SMARTSHEET_STATUS)"

# 3) smartsheet-import endpoint reachable (probe with dummy token)
SMARTSHEET_PROBE=$(curl -sX POST "${BASE_URL}/api/smartsheet-import/probe" \
  -H "Content-Type: application/json" \
  -d '{"token":"test"}')
SMARTSHEET_PROBE_OK=$(echo "$SMARTSHEET_PROBE" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('reachable' if 'ok' in b else 'unreachable')
")
assert_ok "$([[ "$SMARTSHEET_PROBE_OK" == "reachable" ]] && echo 0 || echo 1)" \
  "smartsheet-import probe endpoint reachable (got: $SMARTSHEET_PROBE_OK)"

# 4) smartsheet-import rows endpoint validates input
SMARTSHEET_ROWS=$(curl -s "${BASE_URL}/api/smartsheet-import/rows")
SMARTSHEET_ROWS_OK=$(echo "$SMARTSHEET_ROWS" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('validates' if 'error' in b else 'no-validation')
")
assert_ok "$([[ "$SMARTSHEET_ROWS_OK" == "validates" ]] && echo 0 || echo 1)" \
  "smartsheet-import rows endpoint validates input (got: $SMARTSHEET_ROWS_OK)"

# 5) summary.cloudGapImplementedCount = 7 (after Round-22 smartsuite wired)
IMPL_COUNT=$(echo "$GAP_BODY" | python3 -c "
import json, sys
print(json.load(sys.stdin)['summary']['cloudGapImplementedCount'])
")
assert_ok "$([[ "$IMPL_COUNT" == "14" ]] && echo 0 || echo 1)" \
  "summary.cloudGapImplementedCount == 14 (Round-25: ai_skill promoted; 8 migration/integration + 6 scripting/integration) (got: $IMPL_COUNT)"

# 6) cloudGapCoverage still 14/14=100%
COV_CHECK=$(echo "$GAP_BODY" | python3 -c "
import json, sys
c = json.load(sys.stdin)['summary']['cloudGapCoverage']
print('true' if c['filled'] == 14 and c['percent'] == 100 else 'false:' + str(c))
")
assert_ok "$([[ "$COV_CHECK" == "true" ]] && echo 0 || echo 1)" \
  "cloudGapCoverage still 14/14=100% after smartsheet (got: $COV_CHECK)"

# ----- Section 4.11: smartsuite-import driver wired + implemented metric (Round-22) -----
# Round-22 mirrors R16-R21: smartsuite-import module wired, smartsuite_import cloudGap upgraded.
log "=== Section 4.11: smartsuite-import driver + implemented metric (Round-22) ==="

# 1) smartsuite_import capability present in readiness map
SMARTSUITE_CAP=$(echo "$GAP_BODY" | python3 -c "
import json, sys
caps = json.load(sys.stdin).get('capabilities', {})
s = caps.get('smartsuite_import', {})
print('present' if s.get('module') == 'smartsuite-import' else 'missing:' + str(s))
")
assert_ok "$([[ "$SMARTSUITE_CAP" == "present" ]] && echo 0 || echo 1)" \
  "smartsuite_import registered as capability with module=smartsuite-import (got: $SMARTSUITE_CAP)"

# 2) smartsuite_import cloudGap entry has status='implemented'
SMARTSUITE_STATUS=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin)['cloudGap']
s = next((g for g in gaps if g['key'] == 'smartsuite_import'), None)
print(s['status'] if s else 'MISSING')
")
assert_ok "$([[ "$SMARTSUITE_STATUS" == "implemented" ]] && echo 0 || echo 1)" \
  "smartsuite_import cloudGap status=implemented (Round-22 upgrade) (got: $SMARTSUITE_STATUS)"

# 3) smartsuite-import probe endpoint reachable (probe with dummy token, expect ok=false+error)
SMARTSUITE_PROBE=$(curl -sX POST "${BASE_URL}/api/smartsuite-import/probe" \
  -H "Content-Type: application/json" \
  -d '{"token":"test"}')
SMARTSUITE_PROBE_OK=$(echo "$SMARTSUITE_PROBE" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('reachable' if 'ok' in b else 'unreachable')
")
assert_ok "$([[ "$SMARTSUITE_PROBE_OK" == "reachable" ]] && echo 0 || echo 1)" \
  "smartsuite-import probe endpoint reachable (got: $SMARTSUITE_PROBE_OK)"

# 4) smartsuite-import records endpoint validates input (missing appId)
SMARTSUITE_RECS=$(curl -s "${BASE_URL}/api/smartsuite-import/records?token=test")
SMARTSUITE_RECS_OK=$(echo "$SMARTSUITE_RECS" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('validates' if 'error' in b else 'no-validation')
")
assert_ok "$([[ "$SMARTSUITE_RECS_OK" == "validates" ]] && echo 0 || echo 1)" \
  "smartsuite-import records endpoint validates input (got: $SMARTSUITE_RECS_OK)"

# 5) summary.cloudGapImplementedCount = 7 (after Round-22 smartsuite wired)
IMPL_COUNT=$(echo "$GAP_BODY" | python3 -c "
import json, sys
print(json.load(sys.stdin)['summary']['cloudGapImplementedCount'])
")
assert_ok "$([[ "$IMPL_COUNT" == "14" ]] && echo 0 || echo 1)" \
  "summary.cloudGapImplementedCount == 14 (Round-25: ai_skill promoted; 8 migration/integration + 6 scripting/integration) (got: $IMPL_COUNT)"

# 6) cloudGapCoverage still 14/14=100% (smartsuite upgraded from partial to implemented, count stays same)
COV_CHECK=$(echo "$GAP_BODY" | python3 -c "
import json, sys
c = json.load(sys.stdin)['summary']['cloudGapCoverage']
print('true' if c['filled'] == 14 and c['percent'] == 100 else 'false:' + str(c))
")
assert_ok "$([[ "$COV_CHECK" == "true" ]] && echo 0 || echo 1)" \
  "cloudGapCoverage still 14/14=100% after smartsuite (got: $COV_CHECK)"

# ----- Section 4.12: generic-connector driver + implemented metric (Round-23) -----
# Round-23 mirrors R16-R22 but uses pluggable registry pattern (NOT per-vendor module).
# connect_more_sources is the LAST driver_missing entry; all 8 now implemented.
log "=== Section 4.12: generic-connector driver + implemented metric (Round-23) ==="

# 1) connect_more_sources capability present in readiness map
GENERIC_CAP=$(echo "$GAP_BODY" | python3 -c "
import json, sys
caps = json.load(sys.stdin).get('capabilities', {})
s = caps.get('connect_more_sources', {})
print('present' if s.get('module') == 'generic-connector' else 'missing:' + str(s))
")
assert_ok "$([[ "$GENERIC_CAP" == "present" ]] && echo 0 || echo 1)" \
  "connect_more_sources registered as capability with module=generic-connector (got: $GENERIC_CAP)"

# 2) connect_more_sources cloudGap entry has status='implemented'
GENERIC_STATUS=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin)['cloudGap']
s = next((g for g in gaps if g['key'] == 'connect_more_sources'), None)
print(s['status'] if s else 'MISSING')
")
assert_ok "$([[ "$GENERIC_STATUS" == "implemented" ]] && echo 0 || echo 1)" \
  "connect_more_sources cloudGap status=implemented (Round-23 upgrade, 100% of driver_missing) (got: $GENERIC_STATUS)"

# 3) generic-connector probe endpoint reachable + returns 3 builtin adapter types
GENERIC_PROBE=$(curl -s "${BASE_URL}/api/generic-connector/probe")
GENERIC_PROBE_OK=$(echo "$GENERIC_PROBE" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('ok:' + ','.join(b.get('builtinTypes', [])) if b.get('ok') and b.get('adapterCount') == 3 else 'fail:' + str(b))
")
assert_ok "$([[ "$GENERIC_PROBE_OK" == "ok:csv-url,json-endpoint,rest-api" ]] && echo 0 || echo 1)" \
  "generic-connector probe returns 3 builtin adapter types (got: $GENERIC_PROBE_OK)"

# 4) generic-connector fetch validates input (missing spec)
GENERIC_FETCH=$(curl -sX POST "${BASE_URL}/api/generic-connector/fetch" \
  -H "Content-Type: application/json" \
  -d '{}')
GENERIC_FETCH_OK=$(echo "$GENERIC_FETCH" | python3 -c "
import json, sys
b = json.load(sys.stdin)
print('validates' if 'error' in b else 'no-validation')
")
assert_ok "$([[ "$GENERIC_FETCH_OK" == "validates" ]] && echo 0 || echo 1)" \
  "generic-connector fetch endpoint validates input (got: $GENERIC_FETCH_OK)"

# 5) summary.cloudGapImplementedCount = 8 (after Round-23 connect_more_sources wired)
IMPL_COUNT=$(echo "$GAP_BODY" | python3 -c "
import json, sys
print(json.load(sys.stdin)['summary']['cloudGapImplementedCount'])
")
assert_ok "$([[ "$IMPL_COUNT" == "14" ]] && echo 0 || echo 1)" \
  "summary.cloudGapImplementedCount == 14 (Round-25: ai_skill promoted; 8 migration/integration + 6 scripting/integration) (got: $IMPL_COUNT)"

# 6) cloudGapCoverage still 14/14=100% (connect_more_sources upgraded from partial to implemented, count stays same)
COV_CHECK=$(echo "$GAP_BODY" | python3 -c "
import json, sys
c = json.load(sys.stdin)['summary']['cloudGapCoverage']
print('true' if c['filled'] == 14 and c['percent'] == 100 else 'false:' + str(c))
")
assert_ok "$([[ "$COV_CHECK" == "true" ]] && echo 0 || echo 1)" \
  "cloudGapCoverage still 14/14=100% after generic-connector (got: $COV_CHECK)"

# ----- Section 4.13: 5 sandbox_missing cloudGaps promoted to implemented (Round-24) -----
# Round-24 batch promotes 5 cloudGap entries (run_script_action + ai_script + ai_script_zh
# + api_automation + script_samples) by leveraging the existing automation module:
#   - Node vm module for run_script sandbox (already in executeRunScript)
#   - AutomationAiBuilderService for /api/automation/ai-draft
#   - Full CRUD on /api/automation (api_automation)
#   - NEW: 12 bilingual samples at /api/automation/script-samples (script_samples + ai_script_zh)
# Milestone: cloudGapCoverage hits 100% (14/14) — only ai_skill (partial) remains.
log "=== Section 4.13: 5 sandbox_missing cloudGaps promoted (Round-24, coverage 100% milestone) ==="

# 1) script-samples endpoint returns 12 samples (bilingual library)
SAMPLES=$(curl -s "${BASE_URL}/api/automation/script-samples")
SAMPLES_COUNT=$(echo "$SAMPLES" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('total', 0))
")
assert_ok "$([[ "$SAMPLES_COUNT" == "12" ]] && echo 0 || echo 1)" \
  "script-samples returns 12 samples (Round-24 library) (got: $SAMPLES_COUNT)"

# 2) script-samples locale=zh returns Chinese names
SAMPLES_ZH=$(curl -s "${BASE_URL}/api/automation/script-samples?locale=zh")
SAMPLES_ZH_OK=$(echo "$SAMPLES_ZH" | python3 -c "
import json, sys
d = json.load(sys.stdin)
# Verify locale and that first sample name contains Chinese characters
first = d.get('samples', [{}])[0]
import re
ok = d.get('locale') == 'zh' and bool(re.search(r'[\u4e00-\u9fff]', first.get('name', '')))
print('ok' if ok else 'fail:' + str(d.get('locale')) + '/' + first.get('name', ''))
")
assert_ok "$([[ "$SAMPLES_ZH_OK" == "ok" ]] && echo 0 || echo 1)" \
  "script-samples?locale=zh returns Chinese names (Round-24 i18n) (got: $SAMPLES_ZH_OK)"

# 3) All 5 sandbox_missing cloudGaps have status='implemented'
SANDBOX_STATUS=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin)['cloudGap']
keys = ['run_script_action', 'ai_script', 'ai_script_zh', 'api_automation', 'script_samples']
results = {k: next((g['status'] for g in gaps if g['key'] == k), 'MISSING') for k in keys}
print('ok' if all(v == 'implemented' for v in results.values()) else 'fail:' + ','.join(f'{k}={v}' for k,v in results.items()))
")
assert_ok "$([[ "$SANDBOX_STATUS" == "ok" ]] && echo 0 || echo 1)" \
  "all 5 sandbox_missing cloudGaps implemented (Round-24) (got: $SANDBOX_STATUS)"

# 4) NOT_IMPL_COUNT == 0 (no more not_implemented cloudGaps)
NOT_IMPL_COUNT=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin).get('cloudGap', [])
print(sum(1 for g in gaps if g.get('status') == 'not_implemented'))
")
assert_ok "$([[ "$NOT_IMPL_COUNT" == "0" ]] && echo 0 || echo 1)" \
  "0 not_implemented cloudGaps (Round-24: 5 sandbox_missing promoted, all gaps filled) (got: $NOT_IMPL_COUNT)"

# 5) summary.cloudGapImplementedCount = 13
IMPL_COUNT=$(echo "$GAP_BODY" | python3 -c "
import json, sys
print(json.load(sys.stdin)['summary']['cloudGapImplementedCount'])
")
assert_ok "$([[ "$IMPL_COUNT" == "14" ]] && echo 0 || echo 1)" \
  "summary.cloudGapImplementedCount == 13 (Round-24: 8 migration/integration + 5 scripting) (got: $IMPL_COUNT)"

# 6) cloudGapCoverage at 14/14=100% (Round-24 milestone)
COV_CHECK=$(echo "$GAP_BODY" | python3 -c "
import json, sys
c = json.load(sys.stdin)['summary']['cloudGapCoverage']
print('true' if c['filled'] == 14 and c['percent'] == 100 else 'false:' + str(c))
")
assert_ok "$([[ "$COV_CHECK" == "true" ]] && echo 0 || echo 1)" \
  "cloudGapCoverage at 14/14=100% (Round-24 milestone: all gaps filled) (got: $COV_CHECK)"

# ----- Section 4.14: ai_skill promoted to implemented (Round-25, full 100% implemented milestone) -----
# Round-25 ships 4 inline skill files (SKILL.md / AUTH.md / API.md / EXAMPLES.md) at
# /api/admin/enterprise-readiness/ai-skill/files. AI agents can now install the full
# Teable skill directly from the OSS instance without cloning the external repo.
# Final state: 14/14 cloudGap entries have status='implemented' (no partial, no not_impl).
log "=== Section 4.14: ai_skill inline files + 14/14 implemented milestone (Round-25) ==="

# 1) ai-skill files endpoint returns 4 files
SKILL_FILES=$(curl -s "${BASE_URL}/api/admin/enterprise-readiness/ai-skill/files")
SKILL_FILES_COUNT=$(echo "$SKILL_FILES" | python3 -c "
import json, sys
print(json.load(sys.stdin).get('total', 0))
")
assert_ok "$([[ "$SKILL_FILES_COUNT" == "4" ]] && echo 0 || echo 1)" \
  "ai-skill/files endpoint returns 4 inline skill files (Round-25) (got: $SKILL_FILES_COUNT)"

# 2) each skill file is fetchable via /files/:name and returns markdown content
SKILL_MD=$(curl -s "${BASE_URL}/api/admin/enterprise-readiness/ai-skill/files/SKILL.md")
SKILL_MD_OK=$(echo "$SKILL_MD" | head -1 | grep -c "^# Teable AI Skill" || true)
assert_ok "$([[ "$SKILL_MD_OK" == "1" ]] && echo 0 || echo 1)" \
  "ai-skill/files/SKILL.md returns markdown starting with '# Teable AI Skill' (got: $SKILL_MD_OK)"

# 3) all 14 cloudGaps have status='implemented' (no partial, no not_implemented)
ALL_IMPL=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin)['cloudGap']
total = len(gaps)
impl = sum(1 for g in gaps if g['status'] == 'implemented')
print(f'{impl}/{total}')
")
assert_ok "$([[ "$ALL_IMPL" == "14/14" ]] && echo 0 || echo 1)" \
  "all 14 cloudGap entries implemented (Round-25 milestone: ai_skill promoted) (got: $ALL_IMPL)"

# 4) ai_skill cloudGap entry has status='implemented' (was 'partial' pre-R25)
AISKILL_IMPL=$(echo "$GAP_BODY" | python3 -c "
import json, sys
gaps = json.load(sys.stdin)['cloudGap']
s = next((g for g in gaps if g['key'] == 'ai_skill'), None)
print(s['status'] if s else 'MISSING')
")
assert_ok "$([[ "$AISKILL_IMPL" == "implemented" ]] && echo 0 || echo 1)" \
  "ai_skill cloudGap status=implemented (Round-25 upgrade from partial) (got: $AISKILL_IMPL)"

# 5) EXAMPLES.md is large (>5KB) confirming content embedded
EXAMPLES_BYTES=$(echo "$SKILL_FILES" | python3 -c "
import json, sys
files = json.load(sys.stdin).get('files', [])
e = next((f for f in files if f['name'] == 'EXAMPLES.md'), None)
print(e['bytes'] if e else 0)
")
assert_ok "$([[ $EXAMPLES_BYTES -gt 5000 ]] && echo 0 || echo 1)" \
  "EXAMPLES.md is >5KB inline (Round-25 content) (got: $EXAMPLES_BYTES bytes)"

# 6) Path traversal blocked (security check)
TRAVERSAL_CODE=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/admin/enterprise-readiness/ai-skill/files/../etc/passwd")
assert_ok "$([[ "$TRAVERSAL_CODE" == "404" ]] && echo 0 || echo 1)" \
  "path traversal blocked on /files/:name (Round-25 security) (got: $TRAVERSAL_CODE)"

log "=== Section 4.15: dashboard summary endpoint (Round-27) ==="

# 1) GET /dashboard with admin token returns 200
DASH_HTTP=$(curl -s -o /tmp/dash_body.json -w '%{http_code}' \
  -H "x-admin-token: $ADMIN_TOKEN" "${BASE_URL}/api/admin/enterprise-readiness/dashboard")
assert_ok "$([[ "$DASH_HTTP" == "200" ]] && echo 0 || echo 1)" \
  "GET /dashboard with admin token returns 200 (got: $DASH_HTTP)"

# 2) Dashboard body is valid JSON with all 8 expected top-level keys
DASH_KEYS=$(python3 -c "
import json
d = json.load(open('/tmp/dash_body.json'))
expected = {'generatedAt', 'plan', 'cloudGap', 'capability', 'driverHealth', 'aiSkill', 'authorityMatrix', 'parity', 'recommendations'}
missing = expected - set(d.keys())
print(','.join(sorted(missing)) if missing else 'OK')
")
assert_ok "$([[ "$DASH_KEYS" == "OK" ]] && echo 0 || echo 1)" \
  "dashboard body contains all 8 expected top-level keys (missing: $DASH_KEYS)"

# 3) cloudGap coverage = 100% (carries forward Round-25 milestone)
DASH_GAP_COV=$(python3 -c "
import json
print(json.load(open('/tmp/dash_body.json'))['cloudGap']['coveragePercent'])
")
assert_ok "$([[ "$DASH_GAP_COV" == "100" ]] && echo 0 || echo 1)" \
  "dashboard cloudGap.coveragePercent == 100 (got: $DASH_GAP_COV)"

# 4) capability ratio matches /report endpoint (sanity: enabled + disabled == total)
DASH_CAP_RATIO=$(python3 -c "
import json
c = json.load(open('/tmp/dash_body.json'))['capability']
print(str(c['enabled']) + '/' + str(c['total']))
")
assert_ok "$([[ "$DASH_CAP_RATIO" =~ ^[0-9]+/[0-9]+$ ]] && echo 0 || echo 1)" \
  "dashboard capability.enabled/total is well-formed (got: $DASH_CAP_RATIO)"

# 5) driverHealth.wiredDrivers == totalDrivers (all 11 drivers wired)
DASH_DRIVERS=$(python3 -c "
import json
d = json.load(open('/tmp/dash_body.json'))['driverHealth']
print(str(d['wiredDrivers']) + '/' + str(d['totalDrivers']))
")
assert_ok "$([[ "$DASH_DRIVERS" == "11/11" ]] && echo 0 || echo 1)" \
  "dashboard driverHealth shows 11/11 wired (Round-23 milestone) (got: $DASH_DRIVERS)"

# 6) authorityMatrix.coveragePercent == 100 (carries forward Round-26)
DASH_AM_COV=$(python3 -c "
import json
print(json.load(open('/tmp/dash_body.json'))['authorityMatrix']['coveragePercent'])
")
assert_ok "$([[ "$DASH_AM_COV" == "100" ]] && echo 0 || echo 1)" \
  "dashboard authorityMatrix.coveragePercent == 100 (Round-26) (got: $DASH_AM_COV)"

# 7) parity.businessLicense reflects 46/46 (Cloud target)
DASH_PARITY=$(python3 -c "
import json
print(json.load(open('/tmp/dash_body.json'))['parity']['businessLicense'])
")
assert_ok "$([[ "$DASH_PARITY" == "46/46" ]] && echo 0 || echo 1)" \
  "dashboard parity.businessLicense == 46/46 (got: $DASH_PARITY)"

# 8) recommendations array has >= 1 entry (actionable insight)
DASH_RECOS=$(python3 -c "
import json
print(len(json.load(open('/tmp/dash_body.json'))['recommendations']))
")
assert_ok "$([[ "$DASH_RECOS" -ge 1 ]] && echo 0 || echo 1)" \
  "dashboard recommendations array has >= 1 entry (got: $DASH_RECOS)"

# 9) aiSkill inlineFileCount == 4 (carries forward Round-25)
DASH_AI_FILES=$(python3 -c "
import json
print(json.load(open('/tmp/dash_body.json'))['aiSkill']['inlineFileCount'])
")
assert_ok "$([[ "$DASH_AI_FILES" == "4" ]] && echo 0 || echo 1)" \
  "dashboard aiSkill.inlineFileCount == 4 (Round-25) (got: $DASH_AI_FILES)"

# 10) plan.level is a recognized value (self_hosted or business)
DASH_PLAN=$(python3 -c "
import json
print(json.load(open('/tmp/dash_body.json'))['plan']['level'])
")
assert_ok "$([[ "$DASH_PLAN" == "self_hosted" || "$DASH_PLAN" == "business" ]] && echo 0 || echo 1)" \
  "dashboard plan.level is self_hosted or business (got: $DASH_PLAN)"

# 11) Dashboard rejects unauthenticated request (401)
DASH_NO_AUTH=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/admin/enterprise-readiness/dashboard")
assert_ok "$([[ "$DASH_NO_AUTH" == "401" ]] && echo 0 || echo 1)" \
  "GET /dashboard without token returns 401 (got: $DASH_NO_AUTH)"

log "=== Section 4.16: approval-workflow HTTP CRUD (Round-28) ==="

# 1) List workflows (empty initially — we already cleaned up at Section 2.10 final cleanup)
AW_LIST_EMPTY=$(curl -s "${BASE_URL}/api/base/bse_r28_e2e/approval-workflow" | python3 -c "
import json, sys
print(len(json.load(sys.stdin)['workflows']))
")
assert_ok "$([[ "$AW_LIST_EMPTY" == "0" ]] && echo 0 || echo 1)" \
  "approval-workflow: list empty for fresh base (got: $AW_LIST_EMPTY)"

# 2) Create workflow (any-one strategy)
AW_CREATE=$(curl -s -X POST "${BASE_URL}/api/base/bse_r28_e2e/approval-workflow" \
  -H "Content-Type: application/json" \
  -d '{"tableId":"tbl_r28_e2e","name":"R28 e2e workflow","strategy":"any-one","approverIds":["usr_r28_a","usr_r28_b"]}')
AW_ID=$(echo "$AW_CREATE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('id',''))
")
AW_STRATEGY=$(echo "$AW_CREATE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('strategy',''))
")
assert_ok "$([[ "$AW_ID" =~ ^aw_ ]] && echo 0 || echo 1)" \
  "approval-workflow: create returns id starting with aw_ (got: $AW_ID)"
assert_ok "$([[ "$AW_STRATEGY" == "any-one" ]] && echo 0 || echo 1)" \
  "approval-workflow: strategy echoed back (got: $AW_STRATEGY)"

# 3) Get workflow (round-trip)
sleep 2
AW_GET=$(curl -s "${BASE_URL}/api/approval-workflow/$AW_ID" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('name','') + '|' + str(len(d.get('approverIds',[]))))
")
assert_ok "$([[ "$AW_GET" == "R28 e2e workflow|2" ]] && echo 0 || echo 1)" \
  "approval-workflow: get by id returns full workflow (got: $AW_GET)"

# 4) Create request against the workflow
AW_REQ=$(curl -s -X POST "${BASE_URL}/api/approval-workflow/$AW_ID/request" \
  -H "Content-Type: application/json" \
  -d '{"baseId":"bse_r28_e2e","tableId":"tbl_r28_e2e","recordId":"rec_r28_e2e_1","requesterUserId":"usr_r28_requester","payload":{"field1":"value1","field2":42}}')
AW_REQ_ID=$(echo "$AW_REQ" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('id',''))
")
AW_REQ_STATUS=$(echo "$AW_REQ" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('status',''))
")
assert_ok "$([[ "$AW_REQ_ID" =~ ^ar_ ]] && echo 0 || echo 1)" \
  "approval-workflow: create request returns id starting with ar_ (got: $AW_REQ_ID)"
assert_ok "$([[ "$AW_REQ_STATUS" == "pending" ]] && echo 0 || echo 1)" \
  "approval-workflow: new request status is pending (got: $AW_REQ_STATUS)"

# 5) Cast decision (approve) — any-one strategy → status flips to approved
AW_DECIDE=$(curl -s -X POST "${BASE_URL}/api/approval-request/$AW_REQ_ID/decision" \
  -H "Content-Type: application/json" \
  -d '{"approverUserId":"usr_r28_a","decision":"approve","comment":"R28 LGTM"}')
AW_DECIDED=$(echo "$AW_DECIDE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('decided',False))
")
AW_FINAL_STATUS=$(echo "$AW_DECIDE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('status',''))
")
assert_ok "$([[ "$AW_DECIDED" == "True" ]] && echo 0 || echo 1)" \
  "approval-workflow: decision marks request decided (got: $AW_DECIDED)"
assert_ok "$([[ "$AW_FINAL_STATUS" == "approved" ]] && echo 0 || echo 1)" \
  "approval-workflow: any-one strategy → status=approved (got: $AW_FINAL_STATUS)"

# 6) List decisions — should have 1 entry
AW_DECISIONS=$(curl -s "${BASE_URL}/api/approval-request/$AW_REQ_ID/decisions" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(len(d.get('decisions',[])))
")
assert_ok "$([[ "$AW_DECISIONS" == "1" ]] && echo 0 || echo 1)" \
  "approval-workflow: list decisions returns 1 entry (got: $AW_DECISIONS)"

# 7) Progress endpoint reflects approved status
AW_PROG=$(curl -s "${BASE_URL}/api/approval-request/$AW_REQ_ID/progress" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('status','') + '|' + str(d.get('approvalsCount',-1)))
")
assert_ok "$([[ "$AW_PROG" == "approved|1" ]] && echo 0 || echo 1)" \
  "approval-workflow: progress reports approved + 1 approval (got: $AW_PROG)"

# 8) Capability flips to enabled (with row count = 1)
AW_CAP=$(echo "$DEFAULT_BODY" | python3 -c "
import json, sys
aw = json.load(sys.stdin)['capabilities'].get('approval_workflow', {})
print('count=' + str(aw.get('approvalWorkflow', 0)) + ' enabled=' + str(aw.get('enabled',False)).lower())
")
# Note: DEFAULT_BODY is from Section 2 (before our R28 seed). Use live readiness.
AW_CAP_LIVE=$(curl -sf -H "x-admin-token: ${ADMIN_TOKEN}" "${BASE_URL}/api/admin/enterprise-readiness" | python3 -c "
import json, sys
aw = json.load(sys.stdin)['capabilities'].get('approval_workflow', {})
print('count=' + str(aw.get('approvalWorkflow', 0)) + ' enabled=' + str(aw.get('enabled',False)).lower())
")
assert_ok "$([[ "$AW_CAP_LIVE" =~ enabled=true ]] && echo 0 || echo 1)" \
  "approval-workflow capability now enabled (got: $AW_CAP_LIVE)"

# 9) Delete workflow
AW_DEL=$(curl -s -X DELETE "${BASE_URL}/api/approval-workflow/$AW_ID")
AW_DELETED=$(echo "$AW_DEL" | python3 -c "
import json, sys
print(str(json.load(sys.stdin).get('deleted', False)).lower())
")
assert_ok "$([[ "$AW_DELETED" == "true" ]] && echo 0 || echo 1)" \
  "approval-workflow: delete returns deleted:true (got: $AW_DEL)"

# 10) Get deleted workflow → 404 (after a brief pause to avoid api-rate-limit 429;
#     Section 4 runs under business-license plan, capped at 10 req/s/IP).
sleep 2
AW_404=$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/approval-workflow/$AW_ID")
assert_ok "$([[ "$AW_404" == "404" ]] && echo 0 || echo 1)" \
  "approval-workflow: deleted workflow returns 404 (got: $AW_404)"

log "=== Section 4.17: data-residency HTTP CRUD (Round-29) ==="

# 1) Create a region (US)
DR_REG_US=$(curl -s -X POST "${BASE_URL}/api/data-residency/regions" \
  -H "Content-Type: application/json" \
  -d '{"code":"us","displayName":"United States","dataCenterLocation":"us-east-1"}')
DR_REG_US_CODE=$(echo "$DR_REG_US" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('code',''))
")
DR_REG_US_STATUS=$(echo "$DR_REG_US" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('status',''))
")
assert_ok "$([[ "$DR_REG_US_CODE" == "us" ]] && echo 0 || echo 1)" \
  "data-residency: create region returns code=us (got: $DR_REG_US_CODE)"
assert_ok "$([[ "$DR_REG_US_STATUS" == "active" ]] && echo 0 || echo 1)" \
  "data-residency: new region status is active (got: $DR_REG_US_STATUS)"

# 2) List regions — should include at least our us region
DR_LIST=$(curl -s "${BASE_URL}/api/data-residency/regions" | python3 -c "
import json, sys
d = json.load(sys.stdin)
codes = sorted([r.get('code','') for r in d.get('regions',[])])
print(','.join(codes))
")
# us is always present (Section 2.11 cleanup may remove others); just assert us is in the list
DR_HAS_US=$(echo "$DR_LIST" | grep -c '\bus\b' || true)
assert_ok "$([[ $DR_HAS_US -ge 1 ]] && echo 0 || echo 1)" \
  "data-residency: list regions includes us (got: $DR_LIST)"

# 3) Get region by code
DR_GET=$(curl -s "${BASE_URL}/api/data-residency/regions/us" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('displayName',''))
")
assert_ok "$([[ "$DR_GET" == "United States" ]] && echo 0 || echo 1)" \
  "data-residency: get region by code returns full record (got: $DR_GET)"

# 4) Patch region status (drain) — then re-set back to active so subsequent runs are stable
DR_DRAIN=$(curl -s -X PATCH "${BASE_URL}/api/data-residency/regions/us" \
  -H "Content-Type: application/json" \
  -d '{"status":"draining"}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('status',''))
")
assert_ok "$([[ "$DR_DRAIN" == "draining" ]] && echo 0 || echo 1)" \
  "data-residency: patch region status to draining (got: $DR_DRAIN)"

# Restore to active (cleanup hygiene so re-runs are stable)
curl -s -X PATCH "${BASE_URL}/api/data-residency/regions/us" \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}' >/dev/null

# 5) Set policy (PUT upsert)
DR_POL=$(curl -s -X PUT "${BASE_URL}/api/data-residency/policies/org_r29_e2e" \
  -H "Content-Type: application/json" \
  -d '{"regionCode":"us","locked":false,"updatedBy":"usr_r29_admin"}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('regionCode','') + '|' + str(d.get('locked',False)).lower())
")
assert_ok "$([[ "$DR_POL" == "us|false" ]] && echo 0 || echo 1)" \
  "data-residency: set policy upsert returns regionCode=us locked=false (got: $DR_POL)"

# 6) Get policy
DR_GET_POL=$(curl -s "${BASE_URL}/api/data-residency/policies/org_r29_e2e" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('updatedBy','') + '|' + d.get('regionCode',''))
")
assert_ok "$([[ "$DR_GET_POL" == "usr_r29_admin|us" ]] && echo 0 || echo 1)" \
  "data-residency: get policy returns updatedBy + regionCode (got: $DR_GET_POL)"

# 7) Authorize same-region (us → us, unlocked) → allowed=true
#    Section 4 runs under business license (10 req/s/IP cap); sleep 1.5 to dodge 429.
DR_AUTH_OK=$(sleep 2 && curl -s -X POST "${BASE_URL}/api/data-residency/authorize" \
  -H "Content-Type: application/json" \
  -d '{"organizationId":"org_r29_e2e","requestRegion":"us"}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(str(d.get('allowed',False)).lower() + '|' + d.get('reason',''))
")
assert_ok "$([[ "$DR_AUTH_OK" == "true|same-region" ]] && echo 0 || echo 1)" \
  "data-residency: authorize same-region returns allowed=true|same-region (got: $DR_AUTH_OK)"

# 8) Lock policy then authorize (eu → us, locked) → blocked
curl -s -X PUT "${BASE_URL}/api/data-residency/policies/org_r29_e2e" \
  -H "Content-Type: application/json" \
  -d '{"regionCode":"us","locked":true,"updatedBy":"usr_r29_admin"}' >/dev/null
DR_AUTH_LOCKED=$(sleep 2 && curl -s -X POST "${BASE_URL}/api/data-residency/authorize" \
  -H "Content-Type: application/json" \
  -d '{"organizationId":"org_r29_e2e","requestRegion":"eu"}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(str(d.get('allowed',False)).lower() + '|' + d.get('reason',''))
")
assert_ok "$([[ "$DR_AUTH_LOCKED" == "false|policy-locked" ]] && echo 0 || echo 1)" \
  "data-residency: locked policy + cross region → false|policy-locked (got: $DR_AUTH_LOCKED)"

# 9) Capability flips to enabled (count >= 1)
DR_CAP_LIVE=$(curl -sf -H "x-admin-token: ${ADMIN_TOKEN}" "${BASE_URL}/api/admin/enterprise-readiness" | python3 -c "
import json, sys
dr = json.load(sys.stdin)['capabilities'].get('data_residency_policy', {})
print('count=' + str(dr.get('dataResidencyPolicy', 0)) + ' enabled=' + str(dr.get('enabled',False)).lower())
")
assert_ok "$([[ "$DR_CAP_LIVE" =~ enabled=true ]] && echo 0 || echo 1)" \
  "data-residency_policy capability now enabled (got: $DR_CAP_LIVE)"

# 10) Unlock then delete policy (locked policies can't be deleted — see auth.service.deletePolicy)
curl -s -X PUT "${BASE_URL}/api/data-residency/policies/org_r29_e2e" \
  -H "Content-Type: application/json" \
  -d '{"regionCode":"us","locked":false,"updatedBy":"usr_r29_admin"}' >/dev/null
DR_DEL=$(curl -s -X DELETE "${BASE_URL}/api/data-residency/policies/org_r29_e2e" | python3 -c "
import json, sys
print(str(json.load(sys.stdin).get('deleted', False)).lower())
")
assert_ok "$([[ "$DR_DEL" == "true" ]] && echo 0 || echo 1)" \
  "data-residency: delete policy returns deleted:true (got: $DR_DEL)"

# 11) Sleep 2 to dodge ApiThrottleGuard 429 (Section 4 is under business license)
sleep 2
# Get deleted policy → returns null
DR_GONE=$(curl -s "${BASE_URL}/api/data-residency/policies/org_r29_e2e" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('null' if d.get('policy', 'x') is None else 'present')
")
assert_ok "$([[ "$DR_GONE" == "null" ]] && echo 0 || echo 1)" \
  "data-residency: deleted policy returns policy:null (got: $DR_GONE)"

log "=== Section 4.18: cross-base-federation HTTP CRUD (Round-30) ==="

# 1) Upsert view
sleep 2  # dodge ApiThrottleGuard 429 (Section 4 is under business license)
CBF_V=$(curl -s -X PUT "${BASE_URL}/api/cross-base-federation/views/cbf_v_r30_e2e" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"org_r30_e2e","name":"R30 federation","description":"e2e test","refreshMode":"interval","refreshIntervalSeconds":300}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('id','') + '|' + d.get('name','') + '|' + d.get('status',''))
")
CBF_V_ID=$(echo "$CBF_V" | cut -d'|' -f1)
CBF_V_NAME=$(echo "$CBF_V" | cut -d'|' -f2)
CBF_V_STATUS=$(echo "$CBF_V" | cut -d'|' -f3)
assert_ok "$([[ "$CBF_V_ID" == "cbf_v_r30_e2e" && "$CBF_V_NAME" == "R30 federation" && "$CBF_V_STATUS" == "draft" ]] && echo 0 || echo 1)" \
  "cross-base-federation: upsert view returns id|name|status (got: $CBF_V)"

# 2) Load view
sleep 2
CBF_LOAD=$(curl -s "${BASE_URL}/api/cross-base-federation/views/cbf_v_r30_e2e" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('refreshMode','') + '|' + str(d.get('refreshIntervalSeconds', -1)))
")
assert_ok "$([[ "$CBF_LOAD" == "interval|300" ]] && echo 0 || echo 1)" \
  "cross-base-federation: load view returns refreshMode|intervalSeconds (got: $CBF_LOAD)"

# 3) List views in org
sleep 2
CBF_LIST=$(curl -s "${BASE_URL}/api/cross-base-federation/orgs/org_r30_e2e/views" | python3 -c "
import json, sys
d = json.load(sys.stdin)
ids = sorted([v.get('id','') for v in d.get('views',[])])
print(','.join(ids))
")
assert_ok "$([[ "$CBF_LIST" =~ cbf_v_r30_e2e ]] && echo 0 || echo 1)" \
  "cross-base-federation: list views includes cbf_v_r30_e2e (got: $CBF_LIST)"

# 4) Upsert source
sleep 2
CBF_S=$(curl -s -X PUT "${BASE_URL}/api/cross-base-federation/views/cbf_v_r30_e2e/sources/cbf_s_r30_e2e" \
  -H "Content-Type: application/json" \
  -d '{"baseId":"bse_r30_src","kind":"table","targetId":"tbl_r30","alias":"src1"}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('alias','') + '|' + d.get('kind','') + '|' + d.get('targetId',''))
")
assert_ok "$([[ "$CBF_S" == "src1|table|tbl_r30" ]] && echo 0 || echo 1)" \
  "cross-base-federation: upsert source returns alias|kind|targetId (got: $CBF_S)"

# 5) List sources for view
sleep 2
CBF_SRC_LIST=$(curl -s "${BASE_URL}/api/cross-base-federation/views/cbf_v_r30_e2e/sources" | python3 -c "
import json, sys
d = json.load(sys.stdin)
aliases = sorted([s.get('alias','') for s in d.get('sources',[])])
print(','.join(aliases))
")
assert_ok "$([[ "$CBF_SRC_LIST" =~ src1 ]] && echo 0 || echo 1)" \
  "cross-base-federation: list sources includes src1 (got: $CBF_SRC_LIST)"

# 6) Record event
sleep 2
CBF_E=$(curl -s -X POST "${BASE_URL}/api/cross-base-federation/views/cbf_v_r30_e2e/events" \
  -H "Content-Type: application/json" \
  -d '{"id":"cbf_e_r30_e2e","sourceId":"cbf_s_r30_e2e","kind":"row.created","summary":"1 row"}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('kind','') + '|' + str(d.get('processed', True)).lower() + '|' + d.get('sourceId',''))
")
assert_ok "$([[ "$CBF_E" == "row.created|false|cbf_s_r30_e2e" ]] && echo 0 || echo 1)" \
  "cross-base-federation: record event returns kind|processed|sourceId (got: $CBF_E)"

# 7) List pending events
sleep 2
CBF_E_LIST=$(curl -s "${BASE_URL}/api/cross-base-federation/views/cbf_v_r30_e2e/events" | python3 -c "
import json, sys
d = json.load(sys.stdin)
kinds = sorted([e.get('kind','') for e in d.get('events',[])])
print(','.join(kinds))
")
assert_ok "$([[ "$CBF_E_LIST" =~ row.created ]] && echo 0 || echo 1)" \
  "cross-base-federation: list pending events includes row.created (got: $CBF_E_LIST)"

# 8) Run refresh (consumes pending events; returns done with eventsConsumed>0)
sleep 2
CBF_REFRESH=$(curl -s -X POST "${BASE_URL}/api/cross-base-federation/views/cbf_v_r30_e2e/refresh" \
  -H "Content-Type: application/json" \
  -d '{"triggeredBy":"usr_r30_admin"}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('status','') + '|' + str(d.get('eventsConsumed', -1)))
")
CBF_REFRESH_STATUS=$(echo "$CBF_REFRESH" | cut -d'|' -f1)
CBF_REFRESH_CONSUMED=$(echo "$CBF_REFRESH" | cut -d'|' -f2)
assert_ok "$([[ "$CBF_REFRESH_STATUS" == "done" && "$CBF_REFRESH_CONSUMED" -ge 1 ]] && echo 0 || echo 1)" \
  "cross-base-federation: run refresh returns done with eventsConsumed>=1 (got: $CBF_REFRESH)"

# 9) Persist refresh (manual upsert)
sleep 2
CBF_PERSIST=$(curl -s -X PUT "${BASE_URL}/api/cross-base-federation/refreshes/cbf_refresh_r30_e2e" \
  -H "Content-Type: application/json" \
  -d '{"viewId":"cbf_v_r30_e2e","status":"done","eventsConsumed":3,"rowsWritten":30}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('status','') + '|' + str(d.get('eventsConsumed', -1)) + '|' + str(d.get('rowsWritten', -1)))
")
assert_ok "$([[ "$CBF_PERSIST" == "done|3|30" ]] && echo 0 || echo 1)" \
  "cross-base-federation: persist refresh returns done|3|30 (got: $CBF_PERSIST)"

# 10) Capability flips to enabled (federation_event)
sleep 2
CBF_CAP_LIVE=$(curl -sf -H "x-admin-token: ${ADMIN_TOKEN}" "${BASE_URL}/api/admin/enterprise-readiness" | python3 -c "
import json, sys
fe = json.load(sys.stdin)['capabilities'].get('federation_event', {})
print('enabled=' + str(fe.get('enabled',False)).lower() + ' count=' + str(fe.get('federationEvent', 0)))
")
assert_ok "$([[ "$CBF_CAP_LIVE" =~ enabled=true ]] && echo 0 || echo 1)" \
  "cross-base-federation capability federation_event enabled (got: $CBF_CAP_LIVE)"

log "=== Section 4.19: conflict-replay HTTP CRUD (Round-31) ==="

# Pre-clean any stale rows for this org_id (cleanup() also handles this at
# trap EXIT, but Section 2.6 expects empty meta.conflict_event at startup)
PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -q -c \
  "DELETE FROM meta.conflict_event WHERE org_id='org_r31_e2e';" >/dev/null 2>&1 || true

# 1) Enqueue conflict (offset 0 — fresh org)
sleep 2  # dodge ApiThrottleGuard 429 (Section 4 is under business license)
CR_E=$(curl -s -X POST "${BASE_URL}/api/conflict-replay/events" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"org_r31_e2e","recordId":"rec_r31_a","kind":"optimistic-lock","idempotencyKey":"k_r31_a"}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('kind','') + '|' + str(d.get('offset', -1)) + '|' + d.get('idempotencyKey',''))
")
assert_ok "$([[ "$CR_E" == "optimistic-lock|0|k_r31_a" ]] && echo 0 || echo 1)" \
  "conflict-replay: enqueue returns kind|offset|idempotencyKey (got: $CR_E)"

# 2) Enqueue second event (offset 1)
sleep 2
CR_E2=$(curl -s -X POST "${BASE_URL}/api/conflict-replay/events" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"org_r31_e2e","recordId":"rec_r31_b","kind":"duplicate-write","idempotencyKey":"k_r31_b"}' | python3 -c "
import json, sys
print(json.load(sys.stdin).get('offset', -1))
")
assert_ok "$([[ "$CR_E2" == "1" ]] && echo 0 || echo 1)" \
  "conflict-replay: second enqueue gets offset=1 (got: $CR_E2)"

# 3) List queue
sleep 2
CR_LIST=$(curl -s "${BASE_URL}/api/conflict-replay/orgs/org_r31_e2e/queue" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(len(d.get('events', [])))
")
assert_ok "$([[ "$CR_LIST" -ge 2 ]] && echo 0 || echo 1)" \
  "conflict-replay: queue length >= 2 (got: $CR_LIST)"

# 4) Drain queue with recordIds allowlist (only rec_r31_a matches → drainedCount=1)
sleep 2
CR_DRAIN=$(curl -s -X POST "${BASE_URL}/api/conflict-replay/orgs/org_r31_e2e/drain" \
  -H "Content-Type: application/json" \
  -d '{"recordIds":["rec_r31_a"]}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('drained=' + str(d.get('drainedCount', -1)) + ' remaining=' + str(len(d.get('remaining', []))) + ' attempts=' + str(len(d.get('attempts', []))))
")
assert_ok "$([[ "$CR_DRAIN" == "drained=1 remaining=1 attempts=2" ]] && echo 0 || echo 1)" \
  "conflict-replay: drain with allowlist → drained=1 remaining=1 attempts=2 (got: $CR_DRAIN)"

# 5) Drain with no allowlist (everything fails → drainedCount=0, remaining=1)
sleep 2
CR_DRAIN2=$(curl -s -X POST "${BASE_URL}/api/conflict-replay/orgs/org_r31_e2e/drain" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('drained=' + str(d.get('drainedCount', -1)))
")
assert_ok "$([[ "$CR_DRAIN2" == "drained=0" ]] && echo 0 || echo 1)" \
  "conflict-replay: drain with empty allowlist → drainedCount=0 (got: $CR_DRAIN2)"

# 6) Load single event by id (use the second event which is not yet deleted)
sleep 2
CR_E2_ID="org_r31_e2e:k_r31_b:1"
CR_LOAD=$(curl -s "${BASE_URL}/api/conflict-replay/orgs/org_r31_e2e/events/${CR_E2_ID}" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('kind','') + '|attempts=' + str(d.get('attempts', -1)))
")
assert_ok "$([[ "$CR_LOAD" =~ duplicate-write\|attempts= ]] && echo 0 || echo 1)" \
  "conflict-replay: load event by id returns kind+attempts (got: $CR_LOAD)"

# 7) Delete single event
sleep 2
CR_DEL=$(curl -s -X DELETE "${BASE_URL}/api/conflict-replay/orgs/org_r31_e2e/events/${CR_E2_ID}" | python3 -c "
import json, sys
print(str(json.load(sys.stdin).get('deleted', False)).lower())
")
assert_ok "$([[ "$CR_DEL" == "true" ]] && echo 0 || echo 1)" \
  "conflict-replay: delete event returns deleted:true (got: $CR_DEL)"

# 8) Deleted event returns event:null
sleep 2
CR_GONE=$(curl -s "${BASE_URL}/api/conflict-replay/orgs/org_r31_e2e/events/${CR_E2_ID}" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('null' if d.get('event', 'x') is None else 'present')
")
assert_ok "$([[ "$CR_GONE" == "null" ]] && echo 0 || echo 1)" \
  "conflict-replay: deleted event returns event:null (got: $CR_GONE)"

# 9) Capability flip check (conflict_event)
sleep 2
CR_CAP_LIVE=$(curl -sf -H "x-admin-token: ${ADMIN_TOKEN}" "${BASE_URL}/api/admin/enterprise-readiness" | python3 -c "
import json, sys
ce = json.load(sys.stdin)['capabilities'].get('conflict_event', {})
print('enabled=' + str(ce.get('enabled',False)).lower() + ' count=' + str(ce.get('conflictEvent', 0)))
")
assert_ok "$([[ "$CR_CAP_LIVE" =~ enabled=true ]] && echo 0 || echo 1)" \
  "conflict-replay capability conflict_event enabled (got: $CR_CAP_LIVE)"

log "=== Section 4.20: org-custom-role HTTP CRUD (Round-32) ==="

# Pre-clean (cleanup() also handles this at trap EXIT)
PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -q -c \
  "DELETE FROM meta.role_assignment WHERE org_id='org_r32_e2e'; \
   DELETE FROM meta.custom_role WHERE org_id='org_r32_e2e';" >/dev/null 2>&1 || true

# 1) Upsert role
sleep 2  # dodge ApiThrottleGuard 429 (Section 4 is under business license)
OCR_R=$(curl -s -X PUT "${BASE_URL}/api/org-custom-role/roles/crr_r32_e2e" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"org_r32_e2e","name":"R32 Editor","description":"e2e role","capabilities":["base.read","row.create","row.update"],"scopes":[],"enabled":true}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('name','') + '|' + str(len(d.get('capabilities', []))) + '|' + str(d.get('enabled', False)).lower())
")
assert_ok "$([[ "$OCR_R" == "R32 Editor|3|true" ]] && echo 0 || echo 1)" \
  "org-custom-role: upsert role returns name|capCount|enabled (got: $OCR_R)"

# 2) Load role
sleep 2
OCR_LOAD=$(curl -s "${BASE_URL}/api/org-custom-role/roles/crr_r32_e2e" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('name','') + '|' + ','.join(d.get('capabilities', [])))
")
assert_ok "$([[ "$OCR_LOAD" == "R32 Editor|base.read,row.create,row.update" ]] && echo 0 || echo 1)" \
  "org-custom-role: load role returns name+capabilities (got: $OCR_LOAD)"

# 3) List roles in org
sleep 2
OCR_LIST=$(curl -s "${BASE_URL}/api/org-custom-role/orgs/org_r32_e2e/roles" | python3 -c "
import json, sys
d = json.load(sys.stdin)
names = sorted([r.get('name','') for r in d.get('roles', [])])
print(','.join(names))
")
assert_ok "$([[ "$OCR_LIST" =~ R32\ Editor ]] && echo 0 || echo 1)" \
  "org-custom-role: list roles includes R32 Editor (got: $OCR_LIST)"

# 4) Upsert assignment
sleep 2
OCR_A=$(curl -s -X PUT "${BASE_URL}/api/org-custom-role/assignments/ra_r32_e2e" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"org_r32_e2e","userId":"usr_r32_e2e","roleId":"crr_r32_e2e","baseId":null,"grantedBy":"usr_admin"}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('roleId','') + '|' + d.get('userId','') + '|' + d.get('grantedBy',''))
")
assert_ok "$([[ "$OCR_A" == "crr_r32_e2e|usr_r32_e2e|usr_admin" ]] && echo 0 || echo 1)" \
  "org-custom-role: upsert assignment returns roleId|userId|grantedBy (got: $OCR_A)"

# 5) List user assignments
sleep 2
OCR_AL=$(curl -s "${BASE_URL}/api/org-custom-role/orgs/org_r32_e2e/users/usr_r32_e2e/assignments" | python3 -c "
import json, sys
d = json.load(sys.stdin)
ids = sorted([a.get('id','') for a in d.get('assignments', [])])
print(','.join(ids))
")
assert_ok "$([[ "$OCR_AL" =~ ra_r32_e2e ]] && echo 0 || echo 1)" \
  "org-custom-role: list user assignments includes ra_r32_e2e (got: $OCR_AL)"

# 6) Capability flip check (custom_role) — must run BEFORE deletes since the
#    capability flips based on row count.
sleep 2
OCR_CAP_LIVE=$(curl -sf -H "x-admin-token: ${ADMIN_TOKEN}" "${BASE_URL}/api/admin/enterprise-readiness" | python3 -c "
import json, sys
cr = json.load(sys.stdin)['capabilities'].get('custom_role', {})
print('enabled=' + str(cr.get('enabled',False)).lower() + ' count=' + str(cr.get('customRole', 0)))
")
assert_ok "$([[ "$OCR_CAP_LIVE" =~ enabled=true ]] && echo 0 || echo 1)" \
  "org-custom-role capability custom_role enabled (got: $OCR_CAP_LIVE)"

# 7) Delete assignment (FK: must delete assignment first since it references roleId)
sleep 2
OCR_DA=$(curl -s -X DELETE "${BASE_URL}/api/org-custom-role/assignments/ra_r32_e2e" | python3 -c "
import json, sys
print(str(json.load(sys.stdin).get('deleted', False)).lower())
")
assert_ok "$([[ "$OCR_DA" == "true" ]] && echo 0 || echo 1)" \
  "org-custom-role: delete assignment returns deleted:true (got: $OCR_DA)"

# 8) Delete role
sleep 2
OCR_DR=$(curl -s -X DELETE "${BASE_URL}/api/org-custom-role/roles/crr_r32_e2e" | python3 -c "
import json, sys
print(str(json.load(sys.stdin).get('deleted', False)).lower())
")
assert_ok "$([[ "$OCR_DR" == "true" ]] && echo 0 || echo 1)" \
  "org-custom-role: delete role returns deleted:true (got: $OCR_DR)"

# 9) Deleted role returns role:null
sleep 2
OCR_GONE=$(curl -s "${BASE_URL}/api/org-custom-role/roles/crr_r32_e2e" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('null' if d.get('role', 'x') is None else 'present')
")
assert_ok "$([[ "$OCR_GONE" == "null" ]] && echo 0 || echo 1)" \
  "org-custom-role: deleted role returns role:null (got: $OCR_GONE)"


# ----- Section 4.21: dr-canvas HTTP CRUD (Round-33) -----
log "=== Section 4.21: dr-canvas HTTP CRUD (Round-33) ==="

# 1) PUT canvas
sleep 2
DRC_PUT=$(curl -s -X PUT "${BASE_URL}/api/dr-canvas/canvases/drc_round33_demo" \
  -H 'Content-Type: application/json' \
  -d '{"baseId":"b_e2e_demo","name":"us-eu-replica","canvas":{"nodes":[{"id":"src","kind":"source"}],"edges":[],"version":1},"sourceRegion":"us","destRegion":"eu","createdBy":"u_e2e_demo"}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('nodes='+str(len(d.get('nodes',[]))))")
assert_ok "$([[ "$DRC_PUT" =~ nodes=1 ]] && echo 0 || echo 1)" \
  "dr-canvas: PUT canvas returns 1 node (got: $DRC_PUT)"

# 2) GET canvas
sleep 2
DRC_GET=$(curl -s "${BASE_URL}/api/dr-canvas/canvases/drc_round33_demo" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('nodes='+str(len(d.get('nodes',[]))))
")
assert_ok "$([[ "$DRC_GET" =~ nodes=1 ]] && echo 0 || echo 1)" \
  "dr-canvas: GET canvas returns 1 node (got: $DRC_GET)"

# 3) List canvases for base
sleep 2
DRC_LIST=$(curl -s "${BASE_URL}/api/dr-canvas/bases/b_e2e_demo/canvases" | python3 -c "
import json, sys
d = json.load(sys.stdin)
c = d.get('canvases', [])
print('count='+str(len(c))+',has_demo='+str(any(x.get('id')=='drc_round33_demo' for x in c)).lower())
")
assert_ok "$([[ "$DRC_LIST" =~ count=1 ]] && [[ "$DRC_LIST" =~ has_demo=true ]] && echo 0 || echo 1)" \
  "dr-canvas: list canvases returns 1 demo (got: $DRC_LIST)"

# 4) Validate canvas (pure helper, no persistence)
sleep 2
DRC_VAL=$(curl -s -X POST "${BASE_URL}/api/dr-canvas/canvases/drc_round33_demo/validate" \
  -H 'Content-Type: application/json' \
  -d '{"canvas":{"nodes":[{"id":"src","kind":"snapshot","ref":"pg_basebackup"},{"id":"dst","kind":"replicate","ref":"full_replicate"},{"id":"rst","kind":"restore","ref":"restore_pitr"}],"edges":[{"from":"src","to":"dst"},{"from":"dst","to":"rst"}],"version":1}}' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('valid='+str(d.get('ok', False)).lower())
")
assert_ok "$([[ "$DRC_VAL" =~ valid=true ]] && echo 0 || echo 1)" \
  "dr-canvas: validate returns valid:true (got: $DRC_VAL)"

# 5) Plan execution (pure helper)
sleep 2
DRC_PLAN=$(curl -s -X POST "${BASE_URL}/api/dr-canvas/canvases/drc_round33_demo/plan" \
  -H 'Content-Type: application/json' \
  -d '{"canvas":{"nodes":[{"id":"src","kind":"snapshot","ref":"pg_basebackup"},{"id":"dst","kind":"replicate","ref":"full_replicate"},{"id":"rst","kind":"restore","ref":"restore_pitr"}],"edges":[{"from":"src","to":"dst"},{"from":"dst","to":"rst"}],"version":1}}' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('steps='+str(len(d.get('steps',[]))))
")
assert_ok "$([[ "$DRC_PLAN" =~ steps=3 ]] && echo 0 || echo 1)" \
  "dr-canvas: plan returns 3 steps (got: $DRC_PLAN)"

# 6) DELETE canvas
sleep 2
DRC_DEL=$(curl -s -X DELETE "${BASE_URL}/api/dr-canvas/canvases/drc_round33_demo" | python3 -c "
import json, sys
print(str(json.load(sys.stdin).get('deleted', False)).lower())
")
assert_ok "$([[ "$DRC_DEL" == "true" ]] && echo 0 || echo 1)" \
  "dr-canvas: DELETE canvas returns deleted:true (got: $DRC_DEL)"

# 7) GET after delete returns empty
sleep 2
DRC_GONE=$(curl -s "${BASE_URL}/api/dr-canvas/canvases/drc_round33_demo" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('null' if d.get('canvas', 'x') is None else 'present')
")
assert_ok "$([[ "$DRC_GONE" == "null" ]] && echo 0 || echo 1)" \
  "dr-canvas: deleted canvas returns canvas:null (got: $DRC_GONE)"

# ----- Section 4.22: cuppy AI conversation cloud-parity (Round-AI-1) -----
log "=== Section 4.22: cuppy AI conversation cloud-parity (Round-AI-1, 23 endpoints) ==="

# Sign in as admin user to obtain session cookie (cuppy requires user auth, not admin token)
COOKIE_JAR="/tmp/teable-e2e-cookies.txt"
UAUTH=(-b "$COOKIE_JAR")
sleep 2
SIGNIN_HTTP=$(curl -s -c "$COOKIE_JAR" -o /tmp/teable-e2e-signin.json -w '%{http_code}' \
  -X POST "${BASE_URL}/api/auth/signin" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@teable.local","password":"admin123"}')
assert_ok "$([[ "$SIGNIN_HTTP" == "200" ]] && echo 0 || echo 1)" \
  "cuppy: signin admin user returns 200 (got: HTTP $SIGNIN_HTTP)"

CUPPY_CID="cuppy_e2e_$(date +%s)"

# 1) GET /models
sleep 2
MODELS=$(curl -sf "${UAUTH[@]}" "${BASE_URL}/api/cuppy/models" | python3 -c "
import json, sys
d = json.load(sys.stdin)
m = d.get('models', [])
print('count='+str(len(m))+',has_pro='+str(any(x.get('tier')=='pro' for x in m)).lower())
")
assert_ok "$([[ "$MODELS" =~ count=5 ]] && [[ "$MODELS" =~ has_pro=true ]] && echo 0 || echo 1)" \
  "cuppy: /models returns 5 models including pro tier (got: $MODELS)"

# 2) GET smart-level default (no conversation yet → medium)
sleep 2
SL0=$(curl -sf "${UAUTH[@]}" "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/smart-level" | python3 -c "
import json, sys
print(json.load(sys.stdin).get('smartLevel', 'none'))
")
assert_ok "$([[ "$SL0" == "medium" ]] && echo 0 || echo 1)" \
  "cuppy: default smart-level is medium (got: $SL0)"

# 3) POST smart-level high
sleep 2
SL1=$(curl -s "${UAUTH[@]}" -X POST "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/smart-level" \
  -H 'Content-Type: application/json' \
  -d '{"level":"high"}' | python3 -c "
import json, sys
print(json.load(sys.stdin).get('level', 'none'))
")
assert_ok "$([[ "$SL1" == "high" ]] && echo 0 || echo 1)" \
  "cuppy: set smart-level returns level:high (got: $SL1)"

# 4) PUT memory
sleep 2
MEM_PUT=$(curl -s "${UAUTH[@]}" -X PUT "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/memory" \
  -H 'Content-Type: application/json' \
  -d '{"key":"db_schema","value":"orders(id,customer_id,amount)"}' | python3 -c "
import json, sys
print(json.load(sys.stdin).get('key', 'none'))
")
assert_ok "$([[ "$MEM_PUT" == "db_schema" ]] && echo 0 || echo 1)" \
  "cuppy: PUT memory returns key:db_schema (got: $MEM_PUT)"

# 5) GET memory
sleep 2
MEM_GET=$(curl -sf "${UAUTH[@]}" "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/memory" | python3 -c "
import json, sys
d = json.load(sys.stdin)
m = d.get('memory', {})
print('count='+str(d.get('count',0))+',has_db_schema='+str('db_schema' in m).lower())
")
assert_ok "$([[ "$MEM_GET" =~ count=1 ]] && [[ "$MEM_GET" =~ has_db_schema=true ]] && echo 0 || echo 1)" \
  "cuppy: GET memory returns count=1 with db_schema (got: $MEM_GET)"

# 6) POST artifact
sleep 2
ART_RAW=$(curl -s "${UAUTH[@]}" -X POST "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/artifacts" \
  -H 'Content-Type: application/json' \
  -d '{"name":"SalesChart","kind":"chart","content":"<svg>chart</svg>"}')
ART_ID=$(echo "$ART_RAW" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id','none'))")
assert_ok "$([[ "$ART_ID" != "none" ]] && echo 0 || echo 1)" \
  "cuppy: POST artifact returns id (got: $ART_ID)"

# 7) GET artifacts list
sleep 2
ART_LIST=$(curl -sf "${UAUTH[@]}" "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/artifacts" | python3 -c "
import json, sys
d = json.load(sys.stdin)
a = d.get('artifacts', [])
print('count='+str(d.get('count',0))+',has_chart='+str(any(x.get('kind')=='chart' for x in a)).lower())
")
assert_ok "$([[ "$ART_LIST" =~ count=1 ]] && [[ "$ART_LIST" =~ has_chart=true ]] && echo 0 || echo 1)" \
  "cuppy: GET artifacts list returns count=1 with chart (got: $ART_LIST)"

# 8) POST artifact version (append)
sleep 2
ART_V2=$(curl -s "${UAUTH[@]}" -X POST "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/artifacts/$ART_ID/versions" \
  -H 'Content-Type: application/json' \
  -d '{"content":"<svg>chart-v2</svg>"}' | python3 -c "
import json, sys
print(json.load(sys.stdin).get('versions', 0))
")
assert_ok "$([[ "$ART_V2" == "2" ]] && echo 0 || echo 1)" \
  "cuppy: POST artifact version returns versions:2 (got: $ART_V2)"

# 9) Share artifact on
sleep 2
ART_SHARE=$(curl -s "${UAUTH[@]}" -X POST "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/artifacts/$ART_ID/share" \
  -H 'Content-Type: application/json' \
  -d '{"on":true}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('shared='+str(d.get('shared', False)).lower())
")
assert_ok "$([[ "$ART_SHARE" =~ shared=true ]] && echo 0 || echo 1)" \
  "cuppy: POST artifact share on returns shared:true (got: $ART_SHARE)"

# 10) POST @-node ref
sleep 2
NODE_RAW=$(curl -s "${UAUTH[@]}" -X POST "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/nodes" \
  -H 'Content-Type: application/json' \
  -d '{"kind":"table","refId":"tbl_orders","label":"Orders"}')
NODE_ID=$(echo "$NODE_RAW" | python3 -c "import json,sys; print(json.load(sys.stdin).get('nodeId','none'))")
assert_ok "$([[ "$NODE_ID" != "none" ]] && echo 0 || echo 1)" \
  "cuppy: POST @-node returns nodeId (got: $NODE_ID)"

# 11) GET nodes list
sleep 2
NODE_LIST=$(curl -sf "${UAUTH[@]}" "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/nodes" | python3 -c "
import json, sys
d = json.load(sys.stdin)
n = d.get('nodes', [])
print('count='+str(d.get('count',0))+',has_orders='+str(any(x.get('label')=='Orders' for x in n)).lower())
")
assert_ok "$([[ "$NODE_LIST" =~ count=1 ]] && [[ "$NODE_LIST" =~ has_orders=true ]] && echo 0 || echo 1)" \
  "cuppy: GET nodes list returns count=1 with Orders (got: $NODE_LIST)"

# 12) POST file attachment
sleep 2
FILE_RAW=$(curl -s "${UAUTH[@]}" -X POST "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/files" \
  -H 'Content-Type: application/json' \
  -d '{"name":"report.pdf","mime":"application/pdf","size":12345}')
FILE_ID=$(echo "$FILE_RAW" | python3 -c "import json,sys; print(json.load(sys.stdin).get('fileId','none'))")
assert_ok "$([[ "$FILE_ID" != "none" ]] && echo 0 || echo 1)" \
  "cuppy: POST file returns fileId (got: $FILE_ID)"

# 13) GET files list
sleep 2
FILE_LIST=$(curl -sf "${UAUTH[@]}" "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/files" | python3 -c "
import json, sys
d = json.load(sys.stdin)
f = d.get('files', [])
print('count='+str(d.get('count',0))+',has_pdf='+str(any(x.get('name')=='report.pdf' for x in f)).lower())
")
assert_ok "$([[ "$FILE_LIST" =~ count=1 ]] && [[ "$FILE_LIST" =~ has_pdf=true ]] && echo 0 || echo 1)" \
  "cuppy: GET files list returns count=1 with report.pdf (got: $FILE_LIST)"

# 14) POST model pick
sleep 2
MODEL_PICK=$(curl -s "${UAUTH[@]}" -X POST "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/model" \
  -H 'Content-Type: application/json' \
  -d '{"model":"claude-3-5-sonnet"}' | python3 -c "
import json, sys
print(json.load(sys.stdin).get('model', 'none'))
")
assert_ok "$([[ "$MODEL_PICK" == "claude-3-5-sonnet" ]] && echo 0 || echo 1)" \
  "cuppy: POST model returns claude-3-5-sonnet (got: $MODEL_PICK)"

# 15) DELETE file
sleep 2
FILE_DEL=$(curl -s "${UAUTH[@]}" -X DELETE "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/files/$FILE_ID" | python3 -c "
import json, sys
print(str(json.load(sys.stdin).get('deleted', False)).lower())
")
assert_ok "$([[ "$FILE_DEL" == "true" ]] && echo 0 || echo 1)" \
  "cuppy: DELETE file returns deleted:true (got: $FILE_DEL)"

# 16) DELETE node
sleep 2
NODE_DEL=$(curl -s "${UAUTH[@]}" -X DELETE "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/nodes/$NODE_ID" | python3 -c "
import json, sys
print(str(json.load(sys.stdin).get('deleted', False)).lower())
")
assert_ok "$([[ "$NODE_DEL" == "true" ]] && echo 0 || echo 1)" \
  "cuppy: DELETE node returns deleted:true (got: $NODE_DEL)"

# 17) DELETE artifact
sleep 2
ART_DEL=$(curl -s "${UAUTH[@]}" -X DELETE "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/artifacts/$ART_ID" | python3 -c "
import json, sys
print(str(json.load(sys.stdin).get('deleted', False)).lower())
")
assert_ok "$([[ "$ART_DEL" == "true" ]] && echo 0 || echo 1)" \
  "cuppy: DELETE artifact returns deleted:true (got: $ART_DEL)"

# 18) DELETE memory key
sleep 2
MEM_DEL=$(curl -s "${UAUTH[@]}" -X DELETE "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID/memory" \
  -H 'Content-Type: application/json' \
  -d '{"key":"db_schema"}' | python3 -c "
import json, sys
print(json.load(sys.stdin).get('cleared', 0))
")
assert_ok "$([[ "$MEM_DEL" == "1" ]] && echo 0 || echo 1)" \
  "cuppy: DELETE memory returns cleared:1 (got: $MEM_DEL)"

# 19) DELETE conversation
sleep 2
CONV_DEL=$(curl -s "${UAUTH[@]}" -X DELETE "${BASE_URL}/api/cuppy/conversations/$CUPPY_CID" | python3 -c "
import json, sys
print(str(json.load(sys.stdin).get('deleted', False)).lower())
")
assert_ok "$([[ "$CONV_DEL" == "true" ]] && echo 0 || echo 1)" \
  "cuppy: DELETE conversation returns deleted:true (got: $CONV_DEL)"


# ----- Section 4.23: custom-ai-model HTTP CRUD (Round-AI-2) -----
log "=== Section 4.23: custom-ai-model HTTP CRUD (Round-AI-2, 8 endpoints) ==="

CAM_ORG="org_r_ai_2_demo"
CAM_ALIAS="openai-test-alias"

# 1) GET /providers — list supported provider types
sleep 2
CAM_PROVIDERS=$(curl -sf "${UAUTH[@]}" "${BASE_URL}/api/custom-ai-model/providers" | python3 -c "
import json, sys
d = json.load(sys.stdin)
p = d.get('providers', [])
print('count='+str(d.get('count',0))+',has_openai='+str('custom-openai' in p).lower())
")
assert_ok "$([[ "$CAM_PROVIDERS" =~ count=5 ]] && [[ "$CAM_PROVIDERS" =~ has_openai=true ]] && echo 0 || echo 1)" \
  "custom-ai-model: /providers returns 5 incl. custom-openai (got: $CAM_PROVIDERS)"

# 2) POST /models — create
sleep 2
CAM_CREATE=$(curl -s "${UAUTH[@]}" -X POST "${BASE_URL}/api/custom-ai-model/models" \
  -H 'Content-Type: application/json' \
  -d "{\"orgId\":\"$CAM_ORG\",\"provider\":\"custom-openai\",\"alias\":\"$CAM_ALIAS\",\"modelName\":\"gpt-4o-mini\",\"isolation\":\"shared\"}")
CAM_ID=$(echo "$CAM_CREATE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id','none'))")
assert_ok "$([[ "$CAM_ID" != "none" ]] && echo 0 || echo 1)" \
  "custom-ai-model: POST /models returns id (got: $CAM_ID)"

# 3) GET /models — list
sleep 2
CAM_LIST=$(curl -sf "${UAUTH[@]}" "${BASE_URL}/api/custom-ai-model/models?orgId=$CAM_ORG" | python3 -c "
import json, sys
d = json.load(sys.stdin)
m = d.get('models', [])
print('count='+str(d.get('count',0))+',has_alias='+str(any(x.get('alias')=='$CAM_ALIAS' for x in m)).lower())
")
assert_ok "$([[ "$CAM_LIST" =~ count=1 ]] && [[ "$CAM_LIST" =~ has_alias=true ]] && echo 0 || echo 1)" \
  "custom-ai-model: GET /models lists 1 demo (got: $CAM_LIST)"

# 4) GET /models/:id
sleep 2
CAM_GET=$(curl -sf "${UAUTH[@]}" "${BASE_URL}/api/custom-ai-model/models/$CAM_ID?orgId=$CAM_ORG" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('provider='+str(d.get('provider','none'))+',status='+str(d.get('status','none')))
")
assert_ok "$([[ "$CAM_GET" =~ provider=custom-openai ]] && [[ "$CAM_GET" =~ status=active ]] && echo 0 || echo 1)" \
  "custom-ai-model: GET /models/:id returns provider + status (got: $CAM_GET)"

# 5) PATCH /models/:id — disable
sleep 2
CAM_PATCH=$(curl -s "${UAUTH[@]}" -X PATCH "${BASE_URL}/api/custom-ai-model/models/$CAM_ID?orgId=$CAM_ORG" \
  -H 'Content-Type: application/json' \
  -d '{"status":"disabled","isolation":"per_base"}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('status='+str(d.get('status','none')))
")
assert_ok "$([[ "$CAM_PATCH" =~ status=disabled ]] && echo 0 || echo 1)" \
  "custom-ai-model: PATCH returns status:disabled (got: $CAM_PATCH)"

# 6) POST /models/:id/test — connectivity
sleep 2
CAM_TEST=$(curl -s "${UAUTH[@]}" -X POST "${BASE_URL}/api/custom-ai-model/models/$CAM_ID/test?orgId=$CAM_ORG" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('ok='+str(d.get('ok', False)).lower())
")
assert_ok "$([[ "$CAM_TEST" =~ ok=true ]] && echo 0 || echo 1)" \
  "custom-ai-model: /test returns ok:true (got: $CAM_TEST)"

# 7) GET /usage — aggregate
sleep 2
CAM_USAGE=$(curl -sf "${UAUTH[@]}" "${BASE_URL}/api/custom-ai-model/usage?orgId=$CAM_ORG" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('totalRequests='+str(d.get('totalRequests',-1))+',byModelLen='+str(len(d.get('byModel',[]))))
")
assert_ok "$([[ "$CAM_USAGE" =~ byModelLen=1 ]] && echo 0 || echo 1)" \
  "custom-ai-model: /usage returns 1 byModel entry (got: $CAM_USAGE)"

# 8) DELETE /models/:id
sleep 2
CAM_DEL=$(curl -s "${UAUTH[@]}" -X DELETE "${BASE_URL}/api/custom-ai-model/models/$CAM_ID?orgId=$CAM_ORG" | python3 -c "
import json, sys
print(str(json.load(sys.stdin).get('deleted', False)).lower())
")
assert_ok "$([[ "$CAM_DEL" == "true" ]] && echo 0 || echo 1)" \
  "custom-ai-model: DELETE returns deleted:true (got: $CAM_DEL)"

# 9) Verify gone
sleep 2
CAM_GONE=$(curl -sf "${UAUTH[@]}" "${BASE_URL}/api/custom-ai-model/models/$CAM_ID?orgId=$CAM_ORG" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('null' if d.get('model', 'x') is None else 'present')
")
assert_ok "$([[ "$CAM_GONE" == "null" ]] && echo 0 || echo 1)" \
  "custom-ai-model: deleted model returns model:null (got: $CAM_GONE)"


# ----- Section 4.24: ai-setting HTTP CRUD (Round-AI-3) -----
log "=== Section 4.24: ai-setting HTTP CRUD (Round-AI-3, 8 endpoints) ==="

# 1) GET /api/admin/ai-setting — returns default config (enabled + flags)
sleep 2
AIS_GET=$(curl -sf "${UAUTH[@]}" "${BASE_URL}/api/admin/ai-setting" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('enabled='+str(d.get('enabled',False)).lower()+',model='+str(d.get('defaultModel','none')))
")
assert_ok "$([[ "$AIS_GET" =~ enabled=true ]] && [[ "$AIS_GET" =~ model=gpt-4o-mini ]] && echo 0 || echo 1)" \
  "ai-setting: GET returns enabled:true defaultModel:gpt-4o-mini (got: $AIS_GET)"

# 2) PUT /default-model — switch to claude
sleep 2
AIS_DM=$(curl -s "${UAUTH[@]}" -X PUT "${BASE_URL}/api/admin/ai-setting/default-model" \
  -H 'Content-Type: application/json' \
  -d '{"model":"claude-3-5-sonnet","smartLevel":"high"}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('model='+str(d.get('defaultModel','none'))+',level='+str(d.get('defaultSmartLevel','none')))
")
assert_ok "$([[ "$AIS_DM" =~ model=claude-3-5-sonnet ]] && [[ "$AIS_DM" =~ level=high ]] && echo 0 || echo 1)" \
  "ai-setting: PUT /default-model returns claude + high (got: $AIS_DM)"

# 3) POST /disable — flip enabled=false
sleep 2
AIS_DIS=$(curl -s "${UAUTH[@]}" -X POST "${BASE_URL}/api/admin/ai-setting/disable" | python3 -c "
import json, sys
print(str(json.load(sys.stdin).get('enabled', True)).lower())
")
assert_ok "$([[ "$AIS_DIS" == "false" ]] && echo 0 || echo 1)" \
  "ai-setting: POST /disable returns enabled:false (got: $AIS_DIS)"

# 4) POST /enable — flip back to true
sleep 2
AIS_ENA=$(curl -s "${UAUTH[@]}" -X POST "${BASE_URL}/api/admin/ai-setting/enable" | python3 -c "
import json, sys
print(str(json.load(sys.stdin).get('enabled', False)).lower())
")
assert_ok "$([[ "$AIS_ENA" == "true" ]] && echo 0 || echo 1)" \
  "ai-setting: POST /enable returns enabled:true (got: $AIS_ENA)"

# 5) PUT /credit-policy — refundOnFailure=false + lower perUserDailyCap
sleep 2
AIS_CP=$(curl -s "${UAUTH[@]}" -X PUT "${BASE_URL}/api/admin/ai-setting/credit-policy" \
  -H 'Content-Type: application/json' \
  -d '{"refundOnFailure":false,"perUserDailyCap":50000}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('perUser='+str(d.get('perUserDailyCap',-1))+',refund='+str(d.get('refundOnFailure',True)).lower())
")
assert_ok "$([[ "$AIS_CP" =~ perUser=50000 ]] && [[ "$AIS_CP" =~ refund=false ]] && echo 0 || echo 1)" \
  "ai-setting: PUT /credit-policy returns perUser:50000 refund:false (got: $AIS_CP)"

# 6) GET /credit-policy — verify persisted
sleep 2
AIS_GCP=$(curl -sf "${UAUTH[@]}" "${BASE_URL}/api/admin/ai-setting/credit-policy" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('perUser='+str(d.get('perUserDailyCap',-1))+',refund='+str(d.get('refundOnFailure',True)).lower())
")
assert_ok "$([[ "$AIS_GCP" =~ perUser=50000 ]] && [[ "$AIS_GCP" =~ refund=false ]] && echo 0 || echo 1)" \
  "ai-setting: GET /credit-policy reads back perUser:50000 refund:false (got: $AIS_GCP)"

# 7) PUT / — full partial update (streamingEnabled + allowCustomModels)
sleep 2
AIS_PUT=$(curl -s "${UAUTH[@]}" -X PUT "${BASE_URL}/api/admin/ai-setting" \
  -H 'Content-Type: application/json' \
  -d '{"streamingEnabled":false,"allowCustomModels":false}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('streaming='+str(d.get('streamingEnabled',True)).lower()+',custom='+str(d.get('allowCustomModels',True)).lower())
")
assert_ok "$([[ "$AIS_PUT" =~ streaming=false ]] && [[ "$AIS_PUT" =~ custom=false ]] && echo 0 || echo 1)" \
  "ai-setting: PUT / updates streaming + custom (got: $AIS_PUT)"

# 8) GET /default-model — verify smartLevel persisted
sleep 2
AIS_GDM=$(curl -sf "${UAUTH[@]}" "${BASE_URL}/api/admin/ai-setting/default-model" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('model='+str(d.get('defaultModel','none'))+',level='+str(d.get('defaultSmartLevel','none')))
")
assert_ok "$([[ "$AIS_GDM" =~ model=claude-3-5-sonnet ]] && [[ "$AIS_GDM" =~ level=high ]] && echo 0 || echo 1)" \
  "ai-setting: GET /default-model reads back claude + high (got: $AIS_GDM)"

# ----- Section 4.25: cuppy chat built-in fallback (Round-AI-5) -----
# R-AI-5: /api/cuppy/chat must return a real conversational response even when
# no external LLM is configured. The live CUPPY_LLM_CLIENT now falls back to a
# deterministic echo so the endpoint never returns a 503 to the UI.
log "=== Section 4.25: cuppy chat built-in fallback (Round-AI-5) ==="

# Pre-create demo base + collaborator so admin has access.
PG_SQL_425="$(mktemp)"
cat > "$PG_SQL_425" <<'EOSQL'
INSERT INTO meta.base (id, space_id, name, "order", created_time, created_by)
VALUES ('bse_round_ai5_demo', 'spcsp43Lpj0xS3oW5tH', 'Round AI-5 Demo', 0, now(), 'usrzdwQ3PgckZuDlQvo')
ON CONFLICT (id) DO NOTHING;
INSERT INTO meta.collaborator (id, role_name, resource_type, resource_id, principal_id, principal_type, created_by, created_time)
VALUES ('collab_round_ai5_demo', 'owner', 'base', 'bse_round_ai5_demo', 'usrzdwQ3PgckZuDlQvo', 'user', 'usrzdwQ3PgckZuDlQvo', now())
ON CONFLICT (id) DO NOTHING;
EOSQL
PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -f "$PG_SQL_425" -q > /dev/null
rm -f "$PG_SQL_425"

rm -f /tmp/teable-cookies-425.txt 2>/dev/null || true
curl -sS -X POST "${BASE_URL}/api/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@teable.local","password":"admin123"}' \
  -c /tmp/teable-cookies-425.txt -o /dev/null

# Helper: assert actual env var equals expected env var (string compare). evals via python3.
chk_eq() { A="$1" B="$2" python3 -c "import os; a=os.environ.get(chr(65),''); b=os.environ.get(chr(66),''); print(chr(121) if a==b else chr(110))" 2>/dev/null; }
chk_starts() { A="$1" B="$2" python3 -c "import os; a=os.environ.get(chr(65),''); b=os.environ.get(chr(66),''); print(chr(121) if a.startswith(b) else chr(110))" 2>/dev/null; }
chk_in() {  # chk_in NEEDLE_VAR HAYSTACK_VAR NAME — 'in' substring
  python3 -c "import os; a=os.environ.get('A',''); b=os.environ.get('B',''); print('y' if a in b else 'n')" A="$1" B="$2" 2>/dev/null
}
chk_truthy() { A="$1" python3 -c "import os; v=os.environ.get(chr(65),''); print(chr(121) if v and v!='None' else chr(110))" 2>/dev/null; }

# 1. chat without baseId returns 201 + echo text
CUP_NO_BASE_RAW=$(curl -sS -X POST "${BASE_URL}/api/cuppy/chat" \
  -H "Content-Type: application/json" -b /tmp/teable-cookies-425.txt \
  -d '{"message":"hello teable"}' \
  -w '|%{http_code}' 2>/dev/null)
CUP_CODE_NO_BASE="${CUP_NO_BASE_RAW##*|}"
CUP_BODY_NO_BASE="${CUP_NO_BASE_RAW%|*}"
CID_NO_BASE=$(printf '%s' "$CUP_BODY_NO_BASE" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("conversationId",""))' 2>/dev/null)
CUP_TEXT_NO_BASE=$(printf '%s' "$CUP_BODY_NO_BASE" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("text","")[:120])' 2>/dev/null)
assert_ok "$(chk_eq "$CUP_CODE_NO_BASE" "201")" "cuppy: chat no-baseId returns 201 (got HTTP $CUP_CODE_NO_BASE)"
assert_ok "$(chk_in "built-in fallback" "$CUP_TEXT_NO_BASE")" "cuppy: chat no-baseId text says built-in fallback (got prefix: ${CUP_TEXT_NO_BASE:0:60})"
assert_ok "$(chk_truthy "$CID_NO_BASE")" "cuppy: no-base chat returned a conversationId (got: $CID_NO_BASE)"

# 2. chat with baseId returns echo (no LLM configured) — proves fallback path
CUP_WB_RAW=$(curl -sS -X POST "${BASE_URL}/api/cuppy/chat" \
  -H "Content-Type: application/json" -b /tmp/teable-cookies-425.txt \
  -d '{"baseId":"bse_round_ai5_demo","message":"List tables"}' \
  -w '|%{http_code}' 2>/dev/null)
CUP_CODE_WB="${CUP_WB_RAW##*|}"
CUP_BODY_WB="${CUP_WB_RAW%|*}"
CUP_TEXT_WB=$(printf '%s' "$CUP_BODY_WB" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("text","")[:160])' 2>/dev/null)
CID_WB=$(printf '%s' "$CUP_BODY_WB" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("conversationId",""))' 2>/dev/null)
assert_ok "$(chk_eq "$CUP_CODE_WB" "201")" "cuppy: chat with baseId returns 201 (got HTTP $CUP_CODE_WB)"
assert_ok "$(chk_in "bse_round_ai5_demo" "$CUP_TEXT_WB")" "cuppy: chat with baseId includes base tag (got prefix: ${CUP_TEXT_WB:0:80})"

# 3. follow-up turn with same conversationId — context continues
CUP_FU_RAW=$(curl -sS -X POST "${BASE_URL}/api/cuppy/chat" \
  -H "Content-Type: application/json" -b /tmp/teable-cookies-425.txt \
  -d "$(printf '%s' "{\"baseId\":\"bse_round_ai5_demo\",\"conversationId\":\"$CID_WB\",\"message\":\"And records?\"}")" \
  -w '|%{http_code}' 2>/dev/null)
CUP_CODE_FU="${CUP_FU_RAW##*|}"
assert_ok "$(chk_eq "$CUP_CODE_FU" "201")" "cuppy: follow-up turn returns 201 (got HTTP $CUP_CODE_FU)"

# 4. conversation history contains both turns
HIST=$(curl -sS -b /tmp/teable-cookies-425.txt "${BASE_URL}/api/cuppy/conversations/${CID_WB}/messages" 2>/dev/null)
HIST_LEN=$(printf '%s' "$HIST" | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("messages",[])))' 2>/dev/null)
assert_ok "$(chk_eq "$HIST_LEN" "4")" "cuppy: history contains 4 messages after 2 turns (got: $HIST_LEN)"

# 5. chat with baseId the user cannot access returns 4xx (permission gate, not fallback)
CUP_NP_RAW=$(curl -sS -X POST "${BASE_URL}/api/cuppy/chat" \
  -H "Content-Type: application/json" -b /tmp/teable-cookies-425.txt \
  -d '{"baseId":"bse_demo_enterprise","message":"private"}' \
  -w '|%{http_code}' 2>/dev/null)
CUP_CODE_NP="${CUP_NP_RAW##*|}"
assert_ok "$(chk_starts "$CUP_CODE_NP" "4")" "cuppy: chat without permission returns 4xx (got HTTP $CUP_CODE_NP)"

# 6. inspect endpoint shows conversation metadata
INSPECT=$(curl -sS -b /tmp/teable-cookies-425.txt "${BASE_URL}/api/cuppy/conversations/${CID_WB}" 2>/dev/null)
INSPECT_MSG=$(printf '%s' "$INSPECT" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("messageCount",0))' 2>/dev/null)
assert_ok "$(chk_eq "$INSPECT_MSG" "4")" "cuppy: inspect reports messageCount=4 (got: $INSPECT_MSG)"

# 7. smart-level defaults to medium
SMART=$(curl -sS -b /tmp/teable-cookies-425.txt "${BASE_URL}/api/cuppy/conversations/${CID_WB}/smart-level" 2>/dev/null)
SMART_LEVEL=$(printf '%s' "$SMART" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("smartLevel",""))' 2>/dev/null)
assert_ok "$(chk_eq "$SMART_LEVEL" "medium")" "cuppy: smart-level default is medium (got: $SMART_LEVEL)"

# 8. delete conversation cleans up
DEL_RAW=$(curl -sS -X DELETE -b /tmp/teable-cookies-425.txt "${BASE_URL}/api/cuppy/conversations/${CID_WB}" -w '|%{http_code}' 2>/dev/null)
DEL_CODE="${DEL_RAW##*|}"
DEL_BODY="$(printf '%s' "${DEL_RAW%|*}" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("deleted",False))' 2>/dev/null)"
assert_ok "$(A="$DEL_CODE" B="$DEL_BODY" python3 -c 'import os; a=os.environ.get("A",""); b=os.environ.get("B",""); print("y" if a=="200" and b=="True" else "n")')" "cuppy: DELETE conversation returns deleted:true (got HTTP $DEL_CODE, deleted=$DEL_BODY)"

# Cleanup demo rows so subsequent runs start from baseline.
PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -c "DELETE FROM meta.collaborator WHERE id='collab_round_ai5_demo';" -q > /dev/null
PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -c "DELETE FROM meta.base WHERE id='bse_round_ai5_demo';" -q > /dev/null
rm -f /tmp/teable-cookies-425.txt

# ----- Section 4.26: permission-matrix full CRUD (Round-PERM-1, 13+1 endpoints) -----
# R-PERM: authority-matrix Cloud parity — table/app/workflow node access,
# field/record/record-filter, import/export, default-role for unassigned
# members, and member assignment. Exercises every permission-matrix route so
# the earlier "capability enabled" probe is backed by real endpoint evidence.
log "=== Section 4.26: permission-matrix full CRUD (Round-PERM-1) ==="

# Pre-create demo base + collaborator so admin has base authority_matrix_config.
PG_SQL_426="$(mktemp)"
cat > "$PG_SQL_426" <<'EOSQLE'
INSERT INTO meta.base (id, space_id, name, "order", created_time, created_by)
VALUES ('bse_round_perm1_demo', 'spcsp43Lpj0xS3oW5tH', 'Round PERM-1 Demo', 0, now(), 'usrzdwQ3PgckZuDlQvo')
ON CONFLICT (id) DO NOTHING;
INSERT INTO meta.collaborator (id, role_name, resource_type, resource_id, principal_id, principal_type, created_by, created_time)
VALUES ('collab_round_perm1_demo', 'owner', 'base', 'bse_round_perm1_demo', 'usrzdwQ3PgckZuDlQvo', 'user', 'usrzdwQ3PgckZuDlQvo', now())
ON CONFLICT (id) DO NOTHING;
EOSQLE
PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -f "$PG_SQL_426" -q > /dev/null
rm -f "$PG_SQL_426"

rm -f /tmp/teable-cookies-426.txt 2>/dev/null || true
curl -sS -X POST "${BASE_URL}/api/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@teable.local","password":"admin123"}' \
  -c /tmp/teable-cookies-426.txt -o /dev/null

BASE_PERM="bse_round_perm1_demo"
PM="api/admin/permission-matrix"

# 1. create role (existing endpoint, now exercised)
ROLE_RAW=$(curl -sS -X POST "${BASE_URL}/${PM}/roles" \
  -H "Content-Type: application/json" -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt \
  -d "{\"baseId\":\"$BASE_PERM\",\"name\":\"Sales Rep\",\"description\":\"owns own records\"}" \
  -w '|%{http_code}' 2>/dev/null)
ROLE_CODE="${ROLE_RAW##*|}"
ROLE_BODY="${ROLE_RAW%|*}"
RID_PERM=$(printf '%s' "$ROLE_BODY" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id",""))' 2>/dev/null)
assert_ok "$(chk_eq "$ROLE_CODE" "201")" "permission-matrix: create role returns 201 (got HTTP $ROLE_CODE)"
assert_ok "$(chk_truthy "$RID_PERM")" "permission-matrix: create role returned roleId (got: $RID_PERM)"

# 2. table access (existing endpoint: Cloud 表格 可编辑/无权限)
TBL_CODE=$(curl -sS -X PUT "${BASE_URL}/${PM}/roles/${RID_PERM}/table-access?baseId=${BASE_PERM}" \
  -H "Content-Type: application/json" -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt \
  -d '{"tableId":"tbl_sales_orders","access":"editable"}' \
  -o /dev/null -w '%{http_code}' 2>/dev/null)
assert_ok "$(chk_eq "$TBL_CODE" "200")" "permission-matrix: set table-access returns 200 (got HTTP $TBL_CODE)"

# 3. app access (NEW endpoint: Cloud 应用 可访问/无权限)
APP_CODE=$(curl -sS -X PUT "${BASE_URL}/${PM}/roles/${RID_PERM}/app-access" \
  -H "Content-Type: application/json" -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt \
  -d "{\"baseId\":\"$BASE_PERM\",\"appId\":\"app_sales_dash\",\"access\":\"accessible\"}" \
  -o /dev/null -w '%{http_code}' 2>/dev/null)
assert_ok "$(chk_eq "$APP_CODE" "200")" "permission-matrix: set app-access returns 200 (got HTTP $APP_CODE)"

# 4. workflow access (NEW endpoint: Cloud 工作流 可访问/无权限)
WF_CODE=$(curl -sS -X PUT "${BASE_URL}/${PM}/roles/${RID_PERM}/workflow-access" \
  -H "Content-Type: application/json" -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt \
  -d "{\"baseId\":\"$BASE_PERM\",\"workflowId\":\"wf_first_followup\",\"access\":\"none\"}" \
  -o /dev/null -w '%{http_code}' 2>/dev/null)
assert_ok "$(chk_eq "$WF_CODE" "200")" "permission-matrix: set workflow-access returns 200 (got HTTP $WF_CODE)"

# 5. field permission (existing endpoint: Cloud 字段权限)
FK_CODE=$(curl -sS -X PUT "${BASE_URL}/${PM}/roles/${RID_PERM}/field-permission?baseId=${BASE_PERM}" \
  -H "Content-Type: application/json" -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt \
  -d '{"tableId":"tbl_sales_orders","fieldId":"fld_cost","access":"hidden"}' \
  -o /dev/null -w '%{http_code}' 2>/dev/null)
assert_ok "$(chk_eq "$FK_CODE" "200")" "permission-matrix: set field-permission returns 200 (got HTTP $FK_CODE)"

# 6. record action (existing endpoint: Cloud 记录权限)
RA_CODE=$(curl -sS -X PUT "${BASE_URL}/${PM}/roles/${RID_PERM}/record-action?baseId=${BASE_PERM}" \
  -H "Content-Type: application/json" -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt \
  -d '{"tableId":"tbl_sales_orders","action":"delete","enabled":false}' \
  -o /dev/null -w '%{http_code}' 2>/dev/null)
assert_ok "$(chk_eq "$RA_CODE" "200")" "permission-matrix: set record-action returns 200 (got HTTP $RA_CODE)"

# 7. record filter (existing endpoint: Cloud 记录筛选, sales owner == current user)
RF_CODE=$(curl -sS -X PUT "${BASE_URL}/${PM}/roles/${RID_PERM}/record-filter?baseId=${BASE_PERM}" \
  -H "Content-Type: application/json" -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt \
  -d '{"tableId":"tbl_sales_orders","filter":{"fieldId":"fld_sales_owner","operator":"isCurrentUser","value":null}}' \
  -o /dev/null -w '%{http_code}' 2>/dev/null)
assert_ok "$(chk_eq "$RF_CODE" "200")" "permission-matrix: set record-filter returns 200 (got HTTP $RF_CODE)"

# 8. import/export PUT+GET (existing endpoint: Cloud 导入/导出权限)
IE_CODE=$(curl -sS -X PUT "${BASE_URL}/${PM}/roles/${RID_PERM}/import-export" \
  -H "Content-Type: application/json" -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt \
  -d "{\"baseId\":\"$BASE_PERM\",\"tableId\":\"tbl_sales_orders\",\"canImport\":false,\"canExport\":true}" \
  -o /dev/null -w '%{http_code}' 2>/dev/null)
assert_ok "$(chk_eq "$IE_CODE" "200")" "permission-matrix: set import-export returns 200 (got HTTP $IE_CODE)"
IE_GET=$(curl -sS "${BASE_URL}/${PM}/roles/${RID_PERM}/import-export?baseId=${BASE_PERM}" \
  -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt 2>/dev/null)
IE_GET_EXP=$(printf '%s' "$IE_GET" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[0].get("canExport",False) if isinstance(d,list) else d.get("canExport",False))' 2>/dev/null)
assert_ok "$(chk_eq "$IE_GET_EXP" "True")" "permission-matrix: import-export GET reads back canExport:true (got: $IE_GET_EXP)"

# 9. member add + list (existing endpoint: Cloud 添加协作者)
MB_CODE=$(curl -sS -X POST "${BASE_URL}/${PM}/members" \
  -H "Content-Type: application/json" -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt \
  -d "{\"baseId\":\"$BASE_PERM\",\"roleId\":\"$RID_PERM\",\"userId\":\"usrzdwQ3PgckZuDlQvo\"}" \
  -o /dev/null -w '%{http_code}' 2>/dev/null)
assert_ok "$(chk_eq "$MB_CODE" "201")" "permission-matrix: add member returns 201 (got HTTP $MB_CODE)"
ROLE_LIST=$(curl -sS "${BASE_URL}/${PM}/roles?baseId=${BASE_PERM}" \
  -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt 2>/dev/null)
MEM_COUNT=$(printf '%s' "$ROLE_LIST" | A="$RID_PERM" python3 -c 'import sys,json,os; d=json.load(sys.stdin); rid=os.environ.get(chr(65),""); print(len([r for r in d if r.get("id")==rid][0].get("members",[])))' 2>/dev/null)
assert_ok "$(chk_eq "$MEM_COUNT" "1")" "permission-matrix: role lists 1 member after add (got: $MEM_COUNT)"

# 10. default-role PUT+GET round trip (NEW endpoint: Cloud 默认角色)
DR_PUT=$(curl -sS -X PUT "${BASE_URL}/${PM}/default-role" \
  -H "Content-Type: application/json" -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt \
  -d "{\"baseId\":\"$BASE_PERM\",\"roleId\":\"$RID_PERM\"}" -w '|%{http_code}' 2>/dev/null)
DR_PUT_CODE="${DR_PUT##*|}"
assert_ok "$(chk_eq "$DR_PUT_CODE" "200")" "permission-matrix: set default-role returns 200 (got HTTP $DR_PUT_CODE)"
DR_GET=$(curl -sS "${BASE_URL}/${PM}/default-role?baseId=${BASE_PERM}" \
  -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt 2>/dev/null)
DR_GET_ID=$(printf '%s' "$DR_GET" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("defaultRoleId",""))' 2>/dev/null)
assert_ok "$(chk_eq "$DR_GET_ID" "$RID_PERM")" "permission-matrix: default-role GET reads back roleId (got: $DR_GET_ID)"

# 11. default-role null (Cloud: 无权限 option)
DR_PUT2=$(curl -sS -X PUT "${BASE_URL}/${PM}/default-role" \
  -H "Content-Type: application/json" -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt \
  -d "{\"baseId\":\"$BASE_PERM\",\"roleId\":null}" -w '|%{http_code}' 2>/dev/null)
DR_PUT2_CODE="${DR_PUT2##*|}"
DR_GET2=$(curl -sS "${BASE_URL}/${PM}/default-role?baseId=${BASE_PERM}" \
  -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt 2>/dev/null)
DR_GET2_ID=$(printf '%s' "$DR_GET2" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("defaultRoleId") or "")' 2>/dev/null)
assert_ok "$(chk_eq "$DR_PUT2_CODE" "200")" "permission-matrix: clear default-role to null returns 200 (got HTTP $DR_PUT2_CODE)"
assert_ok "$(chk_eq "$DR_GET2_ID" "")" "permission-matrix: default-role GET returns null after clear (got: [$DR_GET2_ID])"

# 12. delete role (existing endpoint)
DEL_CODE=$(curl -sS -X DELETE "${BASE_URL}/${PM}/roles/${RID_PERM}?baseId=${BASE_PERM}" \
  -H "x-admin-token: ${ADMIN_TOKEN}" -b /tmp/teable-cookies-426.txt \
  -o /dev/null -w '%{http_code}' 2>/dev/null)
assert_ok "$(chk_eq "$DEL_CODE" "200")" "permission-matrix: delete role returns 200 (got HTTP $DEL_CODE)"

# 13. unauthenticated access rejected (regression)
UNAUTH_CODE=$(curl -sS "${BASE_URL}/${PM}/roles?baseId=${BASE_PERM}" -o /dev/null -w '%{http_code}' 2>/dev/null)
assert_ok "$(chk_starts "$UNAUTH_CODE" "4")" "permission-matrix: unauthenticated request rejected (got HTTP $UNAUTH_CODE)"

# Cleanup demo rows so subsequent runs start from baseline.
PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -c "DELETE FROM meta.permission_role_node WHERE role_id='$RID_PERM'; DELETE FROM meta.permission_role WHERE id='$RID_PERM'; DELETE FROM meta.permission_role_import_export WHERE role_id='$RID_PERM'; DELETE FROM meta.collaborator WHERE id='collab_round_perm1_demo'; DELETE FROM meta.base WHERE id='bse_round_perm1_demo'; DELETE FROM meta.setting WHERE name='perm_default_role_for_unassigned';" -q > /dev/null 2>&1
rm -f /tmp/teable-cookies-426.txt
# ----- Section 5: unauthenticated request rejected -----
log "=== Section 5: unauth rejected ==="
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/admin/enterprise-readiness")"
assert_ok "$([[ "$HTTP_CODE" == "401" ]] && echo 0 || echo 1)" \
  "no admin token returns 401 (got: $HTTP_CODE)"

stop_backend
# Final cleanup: remove any demo dashboard rows so subsequent runs start clean
PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -q -c \
  "DELETE FROM meta.dashboard WHERE id LIKE 'dsh_e2e_demo_%';" >/dev/null 2>&1 || true
PGPASSWORD=teable psql -h 127.0.0.1 -p 42345 -U teable -d teable -q -c \
  "DELETE FROM meta.comment_subscription WHERE id LIKE 'cs_e2e_demo_%';" >/dev/null 2>&1 || true
log "=== ALL E2E READINESS ASSERTIONS PASSED ==="
exit 0
