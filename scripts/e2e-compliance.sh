#!/usr/bin/env bash
# scripts/e2e-compliance.sh
#
# R-COMPLIANCE: GDPR / CCPA data export + deletion request audit gate.
#
# Live HTTP gate — requires backend at :3000.
# Asserts:
#   - GET  /api/admin/compliance-audit-pack/status                 → 200 (status)
#   - GET  /api/admin/compliance-audit-pack/count                 → 200 (count)
#   - POST /api/admin/compliance-audit-pack/generate              → 200 (generate pack)
#   - GET  /api/admin/compliance-audit-pack/list                  → 200 (list packs)
#   - GET  /api/admin/audit-log                                    → 200 (audit trail)
#   - GET  /api/admin/audit-log/export                            → 200 (export)

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
TEST_EMAIL="${TEST_EMAIL:-admin@teable.local}"
TEST_PASSWORD="${TEST_PASSWORD:-teable}"
COOKIE="/tmp/teable-compliance-cookie.txt"

pass=0; fail=0
ok()  { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ❌ $1"; fail=$((fail+1)); }

echo
echo "── R-COMPLIANCE GDPR/CCPA gate (live) ───────────────────────────────"

# signin
http=$(curl -sS -o /dev/null -w "%{http_code}" -c "$COOKIE" \
    -X POST "$BACKEND_URL/api/auth/signin" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"redirect\":false}")
[ "$http" = "200" ] && ok "signin → 200" || { bad "signin → $http"; exit 1; }

# 1. Status
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" "$BACKEND_URL/api/admin/compliance-audit-pack/status")
[ "$http" = "200" ] && ok "GET /compliance-audit-pack/status → 200" || bad "GET /status → $http"

# 2. Count
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" "$BACKEND_URL/api/admin/compliance-audit-pack/count")
[ "$http" = "200" ] && ok "GET /compliance-audit-pack/count → 200" || bad "GET /count → $http"

# 3. Generate a compliance pack
http=$(curl -sS -o /tmp/pack-generate.json -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/admin/compliance-audit-pack/generate" \
    -H 'Content-Type: application/json' \
    -d '{"controls":[],"records":[]}')
case "$http" in
    200|201|202) ok "POST /generate → $http" ;;
    *) bad "POST /generate → $http (response: $(cat /tmp/pack-generate.json 2>/dev/null | head -c 200))" ;;
esac

# 4. List packs
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" "$BACKEND_URL/api/admin/compliance-audit-pack/list")
[ "$http" = "200" ] && ok "GET /compliance-audit-pack/list → 200" || bad "GET /list → $http"

# 5. Audit log list
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" "$BACKEND_URL/api/admin/audit-log")
[ "$http" = "200" ] && ok "GET /audit-log → 200" || bad "GET /audit-log → $http"

# 6. Audit log export
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" "$BACKEND_URL/api/admin/audit-log/export")
[ "$http" = "200" ] && ok "GET /audit-log/export → 200" || bad "GET /audit-log/export → $http"

echo
echo "── Summary ───────────────────────────────────────────────"
echo "  $pass pass / $fail fail"
[ "$fail" = "0" ] || exit 1
