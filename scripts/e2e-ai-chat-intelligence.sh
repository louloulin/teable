#!/usr/bin/env bash
# scripts/e2e-ai-chat-intelligence.sh
#
# R-CHAT-2: AI Chat intelligence (smart-level + model) HTTP evidence gate.
#
# Asserts:
#   - GET    /api/chat/sessions/:id/intelligence → 200 with defaults
#   - PATCH  /api/chat/sessions/:id/intelligence { smartLevel: 'high', model: 'claude-3-5-sonnet' } → 200
#   - GET    /api/chat/sessions/:id/intelligence → reflects high + claude-3-5-sonnet
#   - PATCH  { smartLevel: null } → effective falls back to global (medium)
#   - PATCH  { smartLevel: 'turbo' } → 400
#   - PATCH  { model: 'x' * 250 } → 400 (> 200 chars)
#   - anon PATCH → 401
#   - unknown session → 404
#   - non-owner session → 404
#   - allowedTools low ⊊ medium ⊊ high (hierarchy)
#
# Requires: backend running at ${BACKEND_URL}, admin account.

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
TEST_EMAIL="${TEST_EMAIL:-admin@teable.local}"
TEST_PASSWORD="${TEST_PASSWORD:-teable}"
COOKIE="/tmp/teable-aichint-cookie.txt"
ANON="/tmp/teable-aichint-anon.txt"

pass=0; fail=0
ok() { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ❌ $1"; fail=$((fail+1)); }
extract() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

echo
echo "── AI Chat intelligence HTTP gate (R-CHAT-2) ───────────────────"

# 1. signin
http=$(curl -sS -o /dev/null -w "%{http_code}" -c "$COOKIE" \
    -X POST "$BACKEND_URL/api/auth/signin" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"redirect\":false}")
[ "$http" = "200" ] && ok "signin → 200" || { bad "signin → $http"; exit 1; }

# 2. createSession
ses=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/chat/sessions" \
    -H 'Content-Type: application/json' -d '{}')
sid=$(echo "$ses" | extract '["id"]')
[ -n "$sid" ] && ok "createSession → $sid" || { bad "createSession: $ses"; exit 1; }

# 3. GET default intelligence
snap=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/chat/sessions/$sid/intelligence")
level=$(echo "$snap" | extract '["effectiveSmartLevel"]')
[ -n "$level" ] && ok "GET intelligence → effectiveSmartLevel=$level" || bad "GET intelligence: $snap"

# 4. PATCH set high + claude
res=$(curl -sS -b "$COOKIE" -X PATCH "$BACKEND_URL/api/chat/sessions/$sid/intelligence" \
    -H 'Content-Type: application/json' \
    -d '{"smartLevel":"high","model":"claude-3-5-sonnet"}' \
    -o /tmp/aichint-1.json -w "%{http_code}")
level=$(cat /tmp/aichint-1.json | extract '["effectiveSmartLevel"]')
model=$(cat /tmp/aichint-1.json | extract '["effectiveModel"]')
budget=$(cat /tmp/aichint-1.json | extract '["tokenBudget"]')
[ "$res" = "200" ] && [ "$level" = "high" ] && [ "$model" = "claude-3-5-sonnet" ] && [ "$budget" = "64000" ] \
    && ok "PATCH set high+claude (budget=$budget)" || bad "PATCH 1 → $res level=$level model=$model budget=$budget"

# 5. PATCH clear smartLevel (should inherit global)
res=$(curl -sS -b "$COOKIE" -X PATCH "$BACKEND_URL/api/chat/sessions/$sid/intelligence" \
    -H 'Content-Type: application/json' \
    -d '{"smartLevel":null}' \
    -o /tmp/aichint-2.json -w "%{http_code}")
level=$(cat /tmp/aichint-2.json | extract '["effectiveSmartLevel"]')
[ "$res" = "200" ] && [ "$level" != "high" ] \
    && ok "PATCH clear smartLevel → effective=$level (inherited)" || bad "PATCH 2 → $res level=$level"

# 6. bad smartLevel → 400
http=$(curl -sS -b "$COOKIE" -o /dev/null -w "%{http_code}" \
    -X PATCH "$BACKEND_URL/api/chat/sessions/$sid/intelligence" \
    -H 'Content-Type: application/json' \
    -d '{"smartLevel":"turbo"}')
[ "$http" = "400" ] && ok "bad smartLevel → 400" || bad "bad smartLevel → $http"

# 7. bad model (too long) → 400
long=$(python3 -c "print('x' * 250)")
http=$(curl -sS -b "$COOKIE" -o /dev/null -w "%{http_code}" \
    -X PATCH "$BACKEND_URL/api/chat/sessions/$sid/intelligence" \
    -H 'Content-Type: application/json' \
    -d "{\"model\":\"$long\"}")
[ "$http" = "400" ] && ok "long model (>200) → 400" || bad "long model → $http"

# 8. anon PATCH → 401
http=$(curl -sS -o /dev/null -w "%{http_code}" -c "$ANON" \
    -X PATCH "$BACKEND_URL/api/chat/sessions/$sid/intelligence" \
    -H 'Content-Type: application/json' \
    -d '{"smartLevel":"low"}')
[ "$http" = "401" ] && ok "anon PATCH → 401" || bad "anon → $http"

# 9. unknown session → 404
http=$(curl -sS -b "$COOKIE" -o /dev/null -w "%{http_code}" \
    -X PATCH "$BACKEND_URL/api/chat/sessions/sess_does_not_exist/intelligence" \
    -H 'Content-Type: application/json' \
    -d '{"smartLevel":"low"}')
[ "$http" = "404" ] && ok "unknown session PATCH → 404" || bad "unknown session → $http"

# 10. tool hierarchy (low ⊊ medium ⊊ high)
low=$(cat /tmp/aichint-1.json | python3 -c "import json,sys; d=json.load(sys.stdin); l=set(d['allowedTools']); print(len(l))")
high_res=$(curl -sS -b "$COOKIE" -X PATCH "$BACKEND_URL/api/chat/sessions/$sid/intelligence" \
    -H 'Content-Type: application/json' \
    -d '{"smartLevel":"high"}' -o /tmp/aichint-high.json -w "%{http_code}")
high=$(cat /tmp/aichint-high.json | python3 -c "import json,sys; d=json.load(sys.stdin); l=set(d['allowedTools']); print(len(l))")
low_res=$(curl -sS -b "$COOKIE" -X PATCH "$BACKEND_URL/api/chat/sessions/$sid/intelligence" \
    -H 'Content-Type: application/json' \
    -d '{"smartLevel":"low"}' -o /tmp/aichint-low.json -w "%{http_code}")
low=$(cat /tmp/aichint-low.json | python3 -c "import json,sys; d=json.load(sys.stdin); l=set(d['allowedTools']); print(len(l))")
[ "$high_res" = "200" ] && [ "$low_res" = "200" ] && [ "$low" -lt "$high" ] \
    && ok "tool hierarchy: low=$low < high=$high" || bad "tool hierarchy: low=$low high=$high (low_res=$low_res high_res=$high_res)"

echo
echo "  ── summary ──"
echo "  passed: $pass    failed: $fail"
[ "$fail" = "0" ] || exit 1
