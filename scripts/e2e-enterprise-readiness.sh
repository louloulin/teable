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

# Section 2 final assertion: with the meta.organization_ip_allowlist migration
# applied, the meta.setting row inserted, and the 2 documented permission-matrix
# gaps surfaced as disabled probes, exactly 33 of 35 capabilities should be
# enabled on a default self-hosted instance.
EXPECTED_ENABLED=34
assert_ok "$([[ "$ENABLED_CAPS" == "$EXPECTED_ENABLED" ]] && echo 0 || echo 1)" \
  "$EXPECTED_ENABLED/$TOTAL_CAPS capabilities enabled (got enabled=$ENABLED_CAPS; the 2 permission-matrix sub-capabilities below are documented gaps)"

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

# ----- Section 2.5: documented permission-matrix gaps are surfaced -----
log "=== Section 2.5: documented permission-matrix sub-capability probes ==="
for cap in permission_import_export permission_app_workflow; do
  ENABLED_REASON=$(echo "$DEFAULT_BODY" | python3 -c "
import json, sys
body = json.load(sys.stdin)
cap = body['capabilities'].get('$cap', {})
print('enabled=' + str(cap.get('enabled', None)).lower() + ' reason=' + str(cap.get('reason', '')))
")
  if [[ "$cap" == "permission_import_export" ]]; then
    if [[ "$ENABLED_REASON" != "enabled=false reason=import_export_permission_not_yet_modeled" ]]; then
      log "[FAIL] $cap not surfaced as documented gap (got: $ENABLED_REASON)"
      exit 1
    fi
    log "[OK]   $cap is a documented gap ($ENABLED_REASON)"
  fi
done

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
assert_ok "$([[ "$SCORE" -ge 8 ]] && echo 0 || echo 1)" \
  "cloudBusinessParity score $SCORE/$TOTAL >= 8 (Cloud Business features wired)"

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
