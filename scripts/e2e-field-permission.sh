#!/usr/bin/env bash
# scripts/e2e-field-permission.sh
#
# Authority Matrix field-level permission gate (live backend).
#
# Verifies the round-trip:
#   create base + table + record → create role + add admin as member +
#   grant editable + view action + set field permission (hidden) →
#   fetch record → salary field MUST be stripped to null.
#
# If salary is still present in the response, the field-level permission
# path in PermissionInterceptor is broken (V75 P0 bug).
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
COOKIE="/tmp/teable-fp-cookie.txt"

pass=0; fail=0
ok() { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ❌ $1"; fail=$((fail+1)); }

extract_id() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

echo
echo "── Field-level permission HTTP gate ───────────────────"

# 1. signin
http=$(curl -sS -o /dev/null -w "%{http_code}" -c "$COOKIE" \
    -X POST "$BACKEND_URL/api/auth/signin" \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@teable.local","password":"teable","redirect":false}')
[ "$http" = "200" ] && ok "signin → 200" || bad "signin → $http"

# 2. create base
spaceId=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/space" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
base=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/base" \
    -H 'Content-Type: application/json' \
    -d "{\"spaceId\":\"$spaceId\",\"name\":\"e2e-fp-test-$$\"}")
baseId=$(echo "$base" | extract_id '["id"]')
ok "base → $baseId"

# 3. create table
table=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/base/$baseId/table" \
    -H 'Content-Type: application/json' \
    -d '{"name":"employees","fields":[{"name":"title","type":"singleLineText"},{"name":"salary","type":"number"}]}')
tableId=$(echo "$table" | extract_id '["id"]')
salaryFieldId=$(echo "$table" | python3 -c 'import json,sys; t=json.load(sys.stdin); print([f["id"] for f in t["fields"] if f["name"]=="salary"][0])')
ok "table → $tableId"

# 4. create record
rec=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/table/$tableId/record" \
    -H 'Content-Type: application/json' \
    -d '{"records":[{"fields":{"title":"Alice","salary":9000}}]}')
recId=$(echo "$rec" | python3 -c 'import json,sys; r=json.load(sys.stdin)["records"][0]; print(r["id"])')
ok "record → $recId"

# 5. create role
role=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/admin/permission-matrix/roles" \
    -H 'Content-Type: application/json' \
    -d "{\"baseId\":\"$baseId\",\"name\":\"e2e-viewer-$$\"}")
roleId=$(echo "$role" | extract_id '["id"]')
ok "role → $roleId"

# 6. grant table access (editable)
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X PUT "$BACKEND_URL/api/admin/permission-matrix/roles/$roleId/table-access?baseId=$baseId" \
    -H 'Content-Type: application/json' \
    -d "{\"tableId\":\"$tableId\",\"access\":\"editable\"}")
[ "$http" = "200" ] && ok "setTableAccess (editable) → 200" || bad "setTableAccess → $http"

# 7. grant view record action
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X PUT "$BACKEND_URL/api/admin/permission-matrix/roles/$roleId/record-action?baseId=$baseId" \
    -H 'Content-Type: application/json' \
    -d "{\"tableId\":\"$tableId\",\"action\":\"view\",\"enabled\":true}")
[ "$http" = "200" ] && ok "setRecordAction (view) → 200" || bad "setRecordAction → $http"

# 8. set field permission to 'hidden'
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X PUT "$BACKEND_URL/api/admin/permission-matrix/roles/$roleId/field-permission?baseId=$baseId" \
    -H 'Content-Type: application/json' \
    -d "{\"tableId\":\"$tableId\",\"fieldId\":\"$salaryFieldId\",\"access\":\"hidden\"}")
[ "$http" = "200" ] && ok "setFieldPermission (hidden) → 200" || bad "setFieldPermission → $http"

# 9. add admin as member of the role
adminId=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/auth/user/me" | extract_id '["id"]')
ok "adminId → $adminId"
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/admin/permission-matrix/members" \
    -H 'Content-Type: application/json' \
    -d "{\"baseId\":\"$baseId\",\"roleId\":\"$roleId\",\"userId\":\"$adminId\"}")
[ "$http" = "200" ] || [ "$http" = "201" ] && ok "addMember → $http" || bad "addMember → $http"

# 10. invalidate the resolveRolesForUser cache (TTL_MS = 30000 by default) cache by waiting > TTL_MS (30s by default)
#      Actually we cannot easily invalidate cache; the interceptor falls back to
#      fresh fetch on each call. Let me proceed.

sleep 35  # wait for resolveRolesForUser cache TTL to expire
# 11. fetch the record — admin user (now in role) should see salary as null
fetched=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/table/$tableId/record/$recId")
echo "  · fetched record: $fetched"
if echo "$fetched" | grep -q '"salary":9000'; then
    bad "record response leaks hidden salary value 9000"
elif echo "$fetched" | grep -q '"salary":null'; then
    ok "record response correctly strips hidden field to null"
else
    bad "record response missing salary field (unexpected shape)"
fi

# cleanup
curl -sS -b "$COOKIE" -X DELETE "$BACKEND_URL/api/base/$baseId" >/dev/null 2>&1

echo
echo "── Summary ──"
echo "  pass: $pass"
echo "  fail: $fail"
[ "$fail" -eq 0 ]
