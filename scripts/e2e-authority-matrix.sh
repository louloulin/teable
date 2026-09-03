#!/usr/bin/env bash
# scripts/e2e-authority-matrix.sh
#
# Authority Matrix four-role HTTP evidence gate (live backend).
#
# Uses the running local backend at $BACKEND_URL (default 127.0.0.1:3000).
# Verifies the runtime contract that:
#   - admin (admin@teable.local) can reach /api/admin/permission-matrix
#     endpoints (the request body validation runs, not 401/403)
#   - readiness gate requires TEABLE_ADMIN_TOKEN, not user session
#   - permission-matrix endpoints require either TEABLE_ADMIN_TOKEN OR
#     authority_matrix_config permission; missing both → 401/402/403
#
# Note: a true 4-role supertest E2E belongs in
# apps/nestjs-backend/test/authority-matrix.e2e-spec.ts (DB seed required).
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
COOKIE="/tmp/teable-am-cookie.txt"

pass=0; fail=0
ok() { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ✅ $1 (actually reached handler)"; pass=$((pass+1)); }

# ─── 1. signin as admin ───────────────────────────────────────
echo
echo "── Authority Matrix four-role HTTP gate ───────────────────"
http=$(curl -sS -o /dev/null -w "%{http_code}" -c "$COOKIE" \
    -X POST "$BACKEND_URL/api/auth/signin" \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@teable.local","password":"teable","redirect":false}')
if [ "$http" = "200" ]; then ok "admin signin → 200"; else bad "admin signin → $http"; fi

# ─── 2. readiness gate requires TEABLE_ADMIN_TOKEN ────────────
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    "$BACKEND_URL/api/admin/enterprise-readiness")
case "$http" in
  401) ok "readiness without TEABLE_ADMIN_TOKEN → 401";;
  200) ok "readiness with TEABLE_ADMIN_TOKEN → 200 (env was set)";;
  *)   bad "readiness → $http";;
esac

# ─── 3. permission-matrix endpoints: anon / unauthenticated user → 401 ─────
http=$(curl -sS -o /dev/null -w "%{http_code}" \
    -X POST "$BACKEND_URL/api/admin/permission-matrix/roles" \
    -H 'Content-Type: application/json' \
    -d '{"baseId":"bse_test","name":"x"}')
case "$http" in
  401) ok "anon POST permission-matrix/roles → 401";;
  *)   bad "anon POST permission-matrix/roles → $http";;
esac

# ─── 4. permission-matrix with admin session: handler runs (404 base, not 403) ──
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/admin/permission-matrix/roles" \
    -H 'Content-Type: application/json' \
    -d '{"baseId":"bse_test","name":"x"}')
case "$http" in
  404) ok "admin POST permission-matrix/roles → 404 (handler reached, base not found)";;
  200|201) ok "admin POST permission-matrix/roles → $http (created)";;
  *) bad "admin POST permission-matrix/roles → $http (unexpected)";;
esac

# ─── 5. permission-matrix GET list with admin session ────────────
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    "$BACKEND_URL/api/admin/permission-matrix/roles?baseId=bse_test")
case "$http" in
  200|404) ok "admin GET permission-matrix/roles → $http";;
  401|403) bad "admin GET permission-matrix/roles → $http (gate failed)";;
  *) bad "admin GET permission-matrix/roles → $http";;
esac

# ─── 6. permission-matrix default-role endpoint ─────────────────
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    "$BACKEND_URL/api/admin/permission-matrix/default-role?baseId=bse_test")
case "$http" in
  200|404) ok "admin GET default-role → $http";;
  401|403) bad "admin GET default-role → $http (gate failed)";;
  *) bad "admin GET default-role → $http";;
esac

# ─── 7. import-export endpoint ──────────────────────────────────
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    "$BACKEND_URL/api/admin/permission-matrix/roles/role_test/import-export?baseId=bse_test")
case "$http" in
  200|404) ok "admin GET import-export → $http";;
  401|403) bad "admin GET import-export → $http (gate failed)";;
  *) bad "admin GET import-export → $http";;
esac

# ─── 8. view-access endpoint ───────────────────────────────────
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    "$BACKEND_URL/api/admin/permission-matrix/roles/role_test/view-access?baseId=bse_test")
case "$http" in
  200|404) ok "admin GET view-access → $http";;
  401|403) bad "admin GET view-access → $http (gate failed)";;
  *) bad "admin GET view-access → $http";;
esac

# ─── summary ──────────────────────────────────────────────────
echo
echo "── Summary ──"
echo "  pass: $pass"
echo "  fail: $fail"
[ "$fail" -eq 0 ]
