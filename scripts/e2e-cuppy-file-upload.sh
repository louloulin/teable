#!/usr/bin/env bash
# scripts/e2e-cuppy-file-upload.sh
#
# Cuppy file upload HTTP evidence gate (live backend).
#
# Verifies:
#   - POST /api/cuppy/conversations creates a conversation
#   - POST /api/cuppy/conversations/:id/files (metadata-only) registers file
#   - POST /api/cuppy/conversations/:id/files/upload uploads multipart data
#   - GET  /api/cuppy/conversations/:id/files lists registered files
#   - DELETE /api/cuppy/conversations/:id/files/:fileId removes
#   - anon uploads rejected with 401
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
COOKIE="/tmp/teable-cup-cookie.txt"

pass=0; fail=0
ok() { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ❌ $1"; fail=$((fail+1)); }

echo
echo "── Cuppy file upload HTTP gate ───────────────────"

# 1. signin
http=$(curl -sS -o /dev/null -w "%{http_code}" -c "$COOKIE" \
    -X POST "$BACKEND_URL/api/auth/signin" \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@teable.local","password":"teable","redirect":false}')
[ "$http" = "200" ] && ok "signin → 200" || bad "signin → $http"

# 2. create cuppy conversation
conv=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/cuppy/conversations" \
    -H 'Content-Type: application/json' -d '{}')
cid=$(echo "$conv" | sed -n 's/.*"conversationId":"\([^"]*\)".*/\1/p' | head -1)
[ -n "$cid" ] && ok "createConversation → $cid" || bad "createConversation failed: $conv"

# 3. metadata-only addFile
f1=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/cuppy/conversations/$cid/files" \
    -H 'Content-Type: application/json' \
    -d '{"name":"budget.csv","mime":"text/csv","size":1024}')
f1id=$(echo "$f1" | sed -n 's/.*"fileId":"\([^"]*\)".*/\1/p' | head -1)
[ -n "$f1id" ] && ok "addFile (metadata) → $f1id" || bad "addFile failed: $f1"

# 4. multipart upload
tmp=$(mktemp)
echo -e "name,amount\nAlice,100\nBob,200" > "$tmp"
f2=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/cuppy/conversations/$cid/files/upload" \
    -F "file=@$tmp;type=text/csv")
f2id=$(echo "$f2" | sed -n 's/.*"fileId":"\([^"]*\)".*/\1/p' | head -1)
[ -n "$f2id" ] && ok "uploadFile (multipart) → $f2id name=$(echo "$f2" | sed -n 's/.*"name":"\([^"]*\)".*/\1/p' | head -1)" || bad "uploadFile failed: $f2"

# 5. list files
list=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/cuppy/conversations/$cid/files")
count=$(echo "$list" | grep -o '"fileId"' | wc -l | tr -d ' ')
[ "$count" -ge 2 ] && ok "listFiles → $count entries" || bad "listFiles → $count: $list"

# 6. delete one
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X DELETE "$BACKEND_URL/api/cuppy/conversations/$cid/files/$f1id")
[ "$http" = "200" ] && ok "removeFile → 200" || bad "removeFile → $http"

# 7. delete again → idempotent
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X DELETE "$BACKEND_URL/api/cuppy/conversations/$cid/files/$f1id")
[ "$http" = "200" ] || [ "$http" = "404" ] && ok "removeFile (again) → $http (idempotent)" || bad "removeFile (again) → $http"

# 8. anon upload → 401
http=$(curl -sS -o /dev/null -w "%{http_code}" \
    -X POST "$BACKEND_URL/api/cuppy/conversations/$cid/files/upload" \
    -F "file=@$tmp;type=text/csv")
[ "$http" = "401" ] && ok "anon upload → 401" || bad "anon upload → $http"

# cleanup
node -e "require('fs').unlinkSync('$tmp')"

echo
echo "── Summary ──"
echo "  pass: $pass"
echo "  fail: $fail"
[ "$fail" -eq 0 ]
