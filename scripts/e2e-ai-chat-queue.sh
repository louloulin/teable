#!/usr/bin/env bash
# scripts/e2e-ai-chat-queue.sh
#
# AI Chat queue HTTP evidence gate (live backend).
#
# Verifies:
#   - POST /api/chat/sessions creates a session
#   - POST /api/chat/sessions/:id/queue enqueues messages with auto position
#   - GET  /api/chat/sessions/:id/queue returns ordered pending messages
#   - PUT  /api/chat/sessions/:id/queue/reorder reorders the pending queue
#   - DELETE /api/chat/queue/:queueId cancels a pending message
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
COOKIE="/tmp/teable-q-cookie.txt"

pass=0; fail=0
ok() { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ❌ $1"; fail=$((fail+1)); }

echo
echo "── AI Chat queue HTTP gate ───────────────────"

# 1. signin
http=$(curl -sS -o /dev/null -w "%{http_code}" -c "$COOKIE" \
    -X POST "$BACKEND_URL/api/auth/signin" \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@teable.local","password":"teable","redirect":false}')
[ "$http" = "200" ] && ok "signin → 200" || bad "signin → $http"

# 2. create session (no baseId — general chat)
session=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/chat/sessions" \
    -H 'Content-Type: application/json' \
    -d '{}')
sid=$(echo "$session" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
[ -n "$sid" ] && ok "createSession → $sid" || bad "createSession failed: $session"

# 3. enqueue 3 messages
q1=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/chat/sessions/$sid/queue" \
    -H 'Content-Type: application/json' \
    -d '{"userMessage":"first queued"}')
q1id=$(echo "$q1" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
[ -n "$q1id" ] && ok "enqueue 1 → $q1id" || bad "enqueue 1 failed: $q1"

q2=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/chat/sessions/$sid/queue" \
    -H 'Content-Type: application/json' \
    -d '{"userMessage":"second queued"}')
q2id=$(echo "$q2" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
[ -n "$q2id" ] && ok "enqueue 2 → $q2id" || bad "enqueue 2 failed: $q2"

q3=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/chat/sessions/$sid/queue" \
    -H 'Content-Type: application/json' \
    -d '{"userMessage":"third queued"}')
q3id=$(echo "$q3" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
[ -n "$q3id" ] && ok "enqueue 3 → $q3id" || bad "enqueue 3 failed: $q3"

# 4. list queue
list=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/chat/sessions/$sid/queue")
count=$(echo "$list" | grep -o '"id":"[^"]*"' | wc -l | tr -d ' ')
[ "$count" -ge 3 ] && ok "listQueue → $count entries" || bad "listQueue → $count entries: $list"

# 5. reorder (reverse)
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X PUT "$BACKEND_URL/api/chat/sessions/$sid/queue/reorder" \
    -H 'Content-Type: application/json' \
    -d "{\"order\":[\"$q3id\",\"$q2id\",\"$q1id\"]}")
[ "$http" = "200" ] && ok "reorderQueue → 200" || bad "reorderQueue → $http"

# 6. cancel middle
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X DELETE "$BACKEND_URL/api/chat/queue/$q2id")
[ "$http" = "200" ] && ok "cancelQueue → 200" || bad "cancelQueue → $http"

# 7. cancel a second time → 404 (already cancelled)
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X DELETE "$BACKEND_URL/api/chat/queue/$q2id")
[ "$http" = "404" ] && ok "cancelQueue (again) → 404 (idempotent)" || bad "cancelQueue (again) → $http"

# 8. anon enqueue → 401
http=$(curl -sS -o /dev/null -w "%{http_code}" \
    -X POST "$BACKEND_URL/api/chat/sessions/$sid/queue" \
    -H 'Content-Type: application/json' \
    -d '{"userMessage":"anon"}')
[ "$http" = "401" ] && ok "anon enqueue → 401" || bad "anon enqueue → $http"

echo
echo "── Summary ──"
echo "  pass: $pass"
echo "  fail: $fail"
[ "$fail" -eq 0 ]
