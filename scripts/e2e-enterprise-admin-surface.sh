#!/usr/bin/env bash
set -euo pipefail

# Read-only smoke test for the enterprise admin surfaces added in the
# enterprise-readiness change. The backend must already be running.
BASE_URL="${BASE_URL:-http://127.0.0.1:3003}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/teable-enterprise-admin-smoke.cookies}"
EMAIL="${TEABLE_SMOKE_EMAIL:-hello@teable.io}"
PASSWORD="${TEABLE_SMOKE_PASSWORD:-password123}"

curl_json() {
  curl -fsS --max-time 10 "$@"
}

curl_json -X POST "$BASE_URL/api/auth/signin" \
  -H 'content-type: application/json' \
  -c "$COOKIE_JAR" \
  --data-raw "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" >/dev/null

paths=(
  'audit-retention/list'
  'audit-retention/count'
  'audit-retention/stats'
  'risk-event-query/query?limit=5'
  'risk-event-query/count'
  'risk-policy/list?orgId=org1'
  'org-ban-list/list?orgId=org1'
  'org-ban-list/count?orgId=org1'
  'org-quota/org1'
  'org-quota/over/count'
  'org-quota-reservation/org1'
  'org-quota-reservation/org1/count'
  'org-billing-rollup/org1?period=2026-09'
  'multi-region-arbitration/regions'
  'multi-region-arbitration/arbitration/status'
  'full-text-search/index/status?tableId=tbl1'
  'full-text-search/count?q=test'
  'canary/deployments'
  'canary/status'
  'compliance-audit-pack/list'
  'compliance-audit-pack/count'
  'compliance-audit-pack/status'
)

for path in "${paths[@]}"; do
  curl_json -b "$COOKIE_JAR" "$BASE_URL/api/admin/$path" >/dev/null
  printf '[OK] %s\n' "$path"
done

readiness="$(curl_json "$BASE_URL/api/admin/enterprise-readiness" -H 'x-admin-token: test-token')"
python3 -c "import json,sys; d=json.load(sys.stdin); c=d['capabilities']; assert all(v.get('enabled') for v in c.values()), [k for k,v in c.items() if not v.get('enabled')]; print('[OK] readiness {}/{}'.format(sum(v.get('enabled', False) for v in c.values()), len(c)))" <<<"$readiness"
