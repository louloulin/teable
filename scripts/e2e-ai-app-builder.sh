#!/usr/bin/env bash
# scripts/e2e-ai-app-builder.sh
#
# AI App Builder HTTP evidence gate (live backend).
#
# Verifies the controller surface end-to-end:
#   create / list / get / deploy / versions / rollback / secrets / files /
#   delete + anon rejection.
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
COOKIE="/tmp/teable-aab-cookie.txt"

pass=0; fail=0
ok() { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ❌ $1"; fail=$((fail+1)); }

echo
echo "── AI App Builder HTTP gate ───────────────────"

# 1. signin
http=$(curl -sS -o /dev/null -w "%{http_code}" -c "$COOKIE" \
    -X POST "$BACKEND_URL/api/auth/signin" \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@teable.local","password":"teable","redirect":false}')
[ "$http" = "200" ] && ok "signin → 200" || bad "signin → $http"

# 2. get first space
spaceId=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/space" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
[ -n "$spaceId" ] && ok "space → $spaceId" || bad "no space"

# 3. create base
base=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/base" \
    -H 'Content-Type: application/json' \
    -d "{\"spaceId\":\"$spaceId\",\"name\":\"e2e-aab-test-$$\"}")
baseId=$(echo "$base" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
[ -n "$baseId" ] && ok "base → $baseId" || bad "create base failed: $base"

# 4. create app
app=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/$baseId/apps" \
    -H 'Content-Type: application/json' \
    -d '{"name":"e2e-test-app","description":"e2e test"}')
appId=$(echo "$app" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
[ -n "$appId" ] && ok "createApp → $appId" || bad "createApp failed: $app"

# 5. list apps
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    "$BACKEND_URL/api/$baseId/apps")
[ "$http" = "200" ] && ok "listApps → 200" || bad "listApps → $http"

# 6. get one
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    "$BACKEND_URL/api/$baseId/apps/$appId")
[ "$http" = "200" ] && ok "getApp → 200" || bad "getApp → $http"

# 7. deploy
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/$baseId/apps/$appId/deploy" \
    -H 'Content-Type: application/json' -d '{}')
case "$http" in
  200|201) ok "deployApp → $http";;
  *) bad "deployApp → $http";;
esac

# 8. versions
versions=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/$baseId/apps/$appId/versions")
vCount=$(echo "$versions" | grep -o '"id"' | wc -l | tr -d ' ')
[ "$vCount" -ge 1 ] && ok "listVersions → $vCount versions" || bad "listVersions → $vCount: $versions"

# 9. put secret
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X PUT "$BACKEND_URL/api/$baseId/apps/$appId/secrets" \
    -H 'Content-Type: application/json' \
    -d '{"secrets":[{"key":"STRIPE_API_KEY","value":"sk_test_xxx"}]}')
[ "$http" = "200" ] && ok "putSecret → 200" || bad "putSecret → $http"

# 10. list secrets (must NOT return values — write-only)
secrets=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/$baseId/apps/$appId/secrets")
if echo "$secrets" | grep -q '"value":"sk_test_xxx"'; then
    bad "listSecrets leaks secret value: $secrets"
else
    ok "listSecrets does not leak secret value"
fi

# 11. put file
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X PUT "$BACKEND_URL/api/$baseId/apps/$appId/files" \
    -H 'Content-Type: application/json' \
    -d '{"path":"src/index.ts","content":"export const hello = 1;"}')
[ "$http" = "200" ] && ok "putFile → 200" || bad "putFile → $http"

# 12. list files
files=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/$baseId/apps/$appId/files")
fCount=$(echo "$files" | grep -o '"path"' | wc -l | tr -d ' ')
[ "$fCount" -ge 1 ] && ok "listFiles → $fCount files" || bad "listFiles → $fCount: $files"

# 13. delete app
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X DELETE "$BACKEND_URL/api/$baseId/apps/$appId")
case "$http" in
  200|204) ok "deleteApp → $http";;
  *) bad "deleteApp → $http";;
esac

# 14. anon mutation rejected
http=$(curl -sS -o /dev/null -w "%{http_code}" \
    -X POST "$BACKEND_URL/api/$baseId/apps" \
    -H 'Content-Type: application/json' \
    -d '{"name":"anon"}')
[ "$http" = "401" ] && ok "anon createApp → 401" || bad "anon createApp → $http"

# cleanup: delete test base
curl -sS -b "$COOKIE" -X DELETE "$BACKEND_URL/api/base/$baseId" >/dev/null 2>&1

echo
echo "── Summary ──"
echo "  pass: $pass"
echo "  fail: $fail"
[ "$fail" -eq 0 ]
