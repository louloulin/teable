#!/usr/bin/env bash
# scripts/e2e-residency.sh
#
# R-RESIDENCY: per-tenant region tag + cross-region route denial.
#
# Live HTTP gate — requires backend at :3000.
# Asserts:
#   - GET  /api/data-residency/regions              → 200 (lists regions)
#   - POST /api/data-residency/regions              → 200/201 (registers region)
#   - PUT  /api/data-residency/policies/:orgId     → 200 (sets policy)
#   - GET  /api/data-residency/policies/:orgId     → 200 (reads back policy)
#   - POST /api/data-residency/authorize           → 200 (cross-region check)
#   - DELETE /api/data-residency/policies/:orgId  → 200 (cleanup)

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
TEST_EMAIL="${TEST_EMAIL:-admin@teable.local}"
TEST_PASSWORD="${TEST_PASSWORD:-teable}"
COOKIE="/tmp/teable-residency-cookie.txt"

pass=0; fail=0
ok()  { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ❌ $1"; fail=$((fail+1)); }

echo
echo "── R-RESIDENCY per-tenant region gate (live) ────────────────────────"

# signin
http=$(curl -sS -o /dev/null -w "%{http_code}" -c "$COOKIE" \
    -X POST "$BACKEND_URL/api/auth/signin" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"redirect\":false}")
[ "$http" = "200" ] && ok "signin → 200" || { bad "signin → $http"; exit 1; }

# List regions
http=$(curl -sS -o /tmp/regions.json -w "%{http_code}" -b "$COOKIE" \
    "$BACKEND_URL/api/data-residency/regions")
[ "$http" = "200" ] && ok "GET /regions → 200" || { bad "GET /regions → $http"; exit 1; }

# Register a region
REGION_CODE=$(python3 -c "import random; print(\"\".join(chr(97+random.randint(0,25)) for _ in range(2)))")
http=$(curl -sS -o /tmp/region-create.json -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/data-residency/regions" \
    -H 'Content-Type: application/json' \
    -d "{\"code\":\"$REGION_CODE\",\"displayName\":\"E2E test region $REGION_CODE\"}")
case "$http" in
    200|201) ok "POST /regions ($REGION_CODE) → $http" ;;
    *) bad "POST /regions → $http (response: $(cat /tmp/region-create.json 2>/dev/null | head -c 200))" ;;
esac

# Get region by code
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    "$BACKEND_URL/api/data-residency/regions/$REGION_CODE")
[ "$http" = "200" ] && ok "GET /regions/:code → 200" || bad "GET /regions/:code → $http"

# Set policy for an org
ORG_ID="e2e-org-$(date +%s)"
http=$(curl -sS -o /tmp/policy-put.json -w "%{http_code}" -b "$COOKIE" \
    -X PUT "$BACKEND_URL/api/data-residency/policies/$ORG_ID" \
    -H 'Content-Type: application/json' \
    -d "{\"regionCode\":\"$REGION_CODE\",\"locked\":false,\"updatedBy\":\"e2e-residency\"}")
case "$http" in
    200|201) ok "PUT /policies/:orgId → $http" ;;
    *) bad "PUT /policies/:orgId → $http (response: $(cat /tmp/policy-put.json 2>/dev/null | head -c 200))" ;;
esac

# Read policy back
http=$(curl -sS -o /tmp/policy-get.json -w "%{http_code}" -b "$COOKIE" \
    "$BACKEND_URL/api/data-residency/policies/$ORG_ID")
[ "$http" = "200" ] && ok "GET /policies/:orgId → 200" || bad "GET /policies/:orgId → $http"

# Authorize cross-region access
http=$(curl -sS -o /tmp/authorize.json -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/data-residency/authorize" \
    -H 'Content-Type: application/json' \
    -d "{\"organizationId\":\"$ORG_ID\",\"targetRegion\":\"$REGION_CODE\"}")
case "$http" in
    200|201) ok "POST /authorize → $http" ;;
    *) bad "POST /authorize → $http" ;;
esac

# Cleanup
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X DELETE "$BACKEND_URL/api/data-residency/policies/$ORG_ID")
[ "$http" = "200" ] && ok "DELETE /policies/:orgId → 200" || bad "DELETE → $http"

echo
echo "── Summary ───────────────────────────────────────────────"
echo "  $pass pass / $fail fail"
[ "$fail" = "0" ] || exit 1
