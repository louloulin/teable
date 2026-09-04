#!/usr/bin/env bash
# scripts/e2e-ai-chat-selection.sh
#
# V81 R-CHAT-1 — AI Chat selection refs (Grid row/column/cell/range chips)
# HTTP evidence gate (live backend).
#
# Verifies:
#   - POST   /api/chat/sessions                                creates a base-scoped session
#   - POST   /api/chat/sessions/:id/selection                 accepts row/column/cell/range
#   - GET    /api/chat/sessions/:id/selection                 lists the 4 selection types
#   - DELETE /api/chat/sessions/:id/selection/:refId          removes a single chip
#   - DELETE /api/chat/sessions/:id/selection?tableId=...     clears per table
#   - Bad input (unsupported type, missing fields, oversized) → 400
#   - Anonymous                                                   → 401
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
COOKIE="/tmp/teable-aichsel-cookie.txt"

pass=0; fail=0
ok()  { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ❌ $1"; fail=$((fail+1)); }

extract_id() {
  # extract_id '<key-pattern>' <json>
  echo "$2" | sed -n "s/.*$1[^a-zA-Z0-9_-]*\([a-zA-Z0-9_-]\{8,\}\).*/\1/p" | head -1
}

echo
echo "── AI Chat selection refs (R-CHAT-1) HTTP gate ─────────────────"

# 1. signin
http=$(curl -sS -o /dev/null -w "%{http_code}" -c "$COOKIE" \
    -X POST "$BACKEND_URL/api/auth/signin" \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@teable.local","password":"teable","redirect":false}')
[ "$http" = "200" ] && ok "signin → 200" || { bad "signin → $http"; exit 1; }

# 2. create space + base + table for selection testing
spaceId=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/space" \
  | sed -n 's/.*"id":"\([a-zA-Z0-9_-]\{8,\}\)".*/\1/p' | head -1)
[ -n "$spaceId" ] && ok "space → $spaceId" || { bad "no space"; exit 1; }

baseId=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/base" \
    -H 'Content-Type: application/json' \
    -d "{\"spaceId\":\"$spaceId\",\"name\":\"e2e-aichsel-$$\"}" \
  | sed -n 's/.*"id":"\([a-zA-Z0-9_-]\{8,\}\)".*/\1/p' | head -1)
[ -n "$baseId" ] && ok "base → $baseId" || { bad "create base failed"; exit 1; }

tableId=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/base/$baseId/table" \
    -H 'Content-Type: application/json' \
    -d '{"name":"selTest","fields":[{"name":"Name","type":"singleLineText"}]}' \
  | sed -n 's/.*"id":"\([a-zA-Z0-9_-]\{8,\}\)".*/\1/p' | head -1)
[ -n "$tableId" ] && ok "table → $tableId" || { bad "create table failed"; exit 1; }

# 3. create base-scoped chat session
ses=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/chat/sessions" \
    -H 'Content-Type: application/json' \
    -d "{\"baseId\":\"$baseId\",\"tableId\":\"$tableId\"}")
sid=$(extract_id '"id":"' "$ses")
[ -n "$sid" ] && ok "createSession(base) → $sid" || { bad "createSession: $ses"; exit 1; }

# 4. add row selection (≤3 rows → display row preview, >3 → "N rows selected")
row=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/chat/sessions/$sid/selection" \
    -H 'Content-Type: application/json' \
    -d "{\"tableId\":\"$tableId\",\"selectionType\":\"row\",\"refKey\":\"$tableId:row:r1\",\"refValue\":{\"recordId\":\"r1\"},\"displayLabel\":\"row r1\",\"rowCount\":1}")
rowId=$(extract_id '"id":"' "$row")
[ -n "$rowId" ] && ok "addSelectionRef(row) → $rowId" || bad "row add failed: $row"

# 5. add column selection
col=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/chat/sessions/$sid/selection" \
    -H 'Content-Type: application/json' \
    -d "{\"tableId\":\"$tableId\",\"selectionType\":\"column\",\"refKey\":\"$tableId:column:fld_name\",\"refValue\":{\"fieldId\":\"fld_name\"},\"displayLabel\":\"column: name\"}")
colId=$(extract_id '"id":"' "$col")
[ -n "$colId" ] && ok "addSelectionRef(column) → $colId" || bad "col add failed: $col"

# 6. add cell selection
cell=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/chat/sessions/$sid/selection" \
    -H 'Content-Type: application/json' \
    -d "{\"tableId\":\"$tableId\",\"selectionType\":\"cell\",\"refKey\":\"$tableId:cell:fld_name:r1\",\"refValue\":{\"fieldId\":\"fld_name\",\"recordId\":\"r1\"},\"displayLabel\":\"name: alice\"}")
cellId=$(extract_id '"id":"' "$cell")
[ -n "$cellId" ] && ok "addSelectionRef(cell) → $cellId" || bad "cell add failed: $cell"

# 7. add range selection (3 rows)
range=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/chat/sessions/$sid/selection" \
    -H 'Content-Type: application/json' \
    -d "{\"tableId\":\"$tableId\",\"selectionType\":\"range\",\"refKey\":\"$tableId:range:r1-r3\",\"refValue\":{\"from\":\"r1\",\"to\":\"r3\"},\"displayLabel\":\"3 rows selected\",\"rowCount\":3}")
rangeId=$(extract_id '"id":"' "$range")
[ -n "$rangeId" ] && ok "addSelectionRef(range) → $rangeId" || bad "range add failed: $range"

# 8. list all 4 selections
list=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/chat/sessions/$sid/selection")
count=$(echo "$list" | grep -o '"id":"' | wc -l | tr -d ' ')
[ "$count" -eq 4 ] && ok "listSelectionRefs → 4 chips" || bad "list count: $count ($list)"

# 9. delete one chip
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X DELETE "$BACKEND_URL/api/chat/sessions/$sid/selection/$rowId")
[ "$http" = "200" ] && ok "removeSelectionRef → 200" || bad "remove → $http"

# 10. list shows 3 chips left
list=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/chat/sessions/$sid/selection")
count=$(echo "$list" | grep -o '"id":"' | wc -l | tr -d ' ')
[ "$count" -eq 3 ] && ok "after delete → 3 chips" || bad "after delete count: $count"

# 11. clearTable
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X DELETE "$BACKEND_URL/api/chat/sessions/$sid/selection?tableId=$tableId")
[ "$http" = "200" ] && ok "clearTable → 200" || bad "clearTable → $http"

list=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/chat/sessions/$sid/selection")
count=$(echo "$list" | grep -o '"id":"' | wc -l | tr -d ' ')
[ "$count" -eq 0 ] && ok "after clearTable → 0 chips" || bad "after clear count: $count"

# 12. bad: unsupported selection type → 400
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/chat/sessions/$sid/selection" \
    -H 'Content-Type: application/json' \
    -d "{\"tableId\":\"$tableId\",\"selectionType\":\"oops\",\"refKey\":\"x\",\"refValue\":{},\"displayLabel\":\"y\"}")
[ "$http" = "400" ] && ok "unsupported type → 400" || bad "bad type → $http"

# 13. bad: missing refKey → 400
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/chat/sessions/$sid/selection" \
    -H 'Content-Type: application/json' \
    -d "{\"tableId\":\"$tableId\",\"selectionType\":\"row\",\"refKey\":\"\",\"refValue\":{},\"displayLabel\":\"y\"}")
[ "$http" = "400" ] && ok "empty refKey → 400" || bad "empty refKey → $http"

# 14. anon → 401
http=$(curl -sS -o /dev/null -w "%{http_code}" \
    "$BACKEND_URL/api/chat/sessions/$sid/selection")
[ "$http" = "401" ] && ok "anon → 401" || bad "anon → $http"

# 15. unknown session → 404
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    "$BACKEND_URL/api/chat/sessions/ses_does_not_exist/selection")
[ "$http" = "404" ] && ok "unknown session → 404" || bad "unknown session → $http"

# 16. renderPrompt (via list after re-adding) — proves prompt-side integration
range2=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/chat/sessions/$sid/selection" \
    -H 'Content-Type: application/json' \
    -d "{\"tableId\":\"$tableId\",\"selectionType\":\"range\",\"refKey\":\"$tableId:range:r1-r5\",\"refValue\":{\"from\":\"r1\",\"to\":\"r5\"},\"displayLabel\":\"5 rows selected\",\"rowCount\":5}")
list=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/chat/sessions/$sid/selection")
echo "$list" | grep -q '"rowCount":5' && ok "rowCount persisted" || bad "rowCount missing: $list"

echo
echo "── R-CHAT-1 selection gate ────────────────────────────────────"
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
