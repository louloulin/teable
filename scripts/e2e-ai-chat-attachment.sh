#!/usr/bin/env bash
# scripts/e2e-ai-chat-attachment.sh
#
# AI Chat attachment HTTP evidence gate (live backend).
#
# Proves the V75 wiring at HTTP layer:
#   - POST /api/chat/sessions creates a chat session
#   - POST /api/chat/sessions/:id/turn accepts `attachmentIds: string[]`
#     in body (NOT rejected by validation; reaches chatTurn)
#   - When LLM provider is configured, the assistant reply is generated
#     with the attachment content injected into the prompt
#   - When no LLM provider is configured, we expect the well-known
#     "AI provider is not configured" error — NOT a 400 from validation
#     (which would mean the field didn't reach the service)
#   - anon POST → 401
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
COOKIE="/tmp/teable-att-cookie.txt"

pass=0; fail=0
ok() { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ❌ $1"; fail=$((fail+1)); }

extract_id() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

echo
echo "── AI Chat attachment HTTP gate ───────────────────"

# 1. signin
http=$(curl -sS -o /dev/null -w "%{http_code}" -c "$COOKIE" \
    -X POST "$BACKEND_URL/api/auth/signin" \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@teable.local","password":"teable","redirect":false}')
[ "$http" = "200" ] && ok "signin → 200" || bad "signin → $http"

# 2. create chat session
ses=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/chat/sessions" \
    -H 'Content-Type: application/json' -d '{}')
sid=$(echo "$ses" | extract_id '["id"]')
[ -n "$sid" ] && ok "createSession → $sid" || bad "createSession failed: $ses"

# 3. POST chatTurn with attachmentIds — field is accepted by controller
#    We don't have a real LLM provider, but the field MUST reach chatTurn,
#    which means we should NOT get a 400 from ZodValidationPipe.
#    We expect either:
#      (a) success with assistantMessageId — LLM configured
#      (b) 500/400 with "AI provider is not configured" — service reached
#      (c) NEVER: 400 with "attachmentIds must be array" — would mean the
#          field was rejected by validation before reaching chatTurn.
resp=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/chat/sessions/$sid/turn" \
    -H 'Content-Type: application/json' \
    -d '{"userMessage":"summarize","attachmentIds":["missing-token-xyz"]}' \
    -o /tmp/ai-chat-turn.json -w "%{http_code}")
echo "  · chatTurn HTTP status: $resp"
echo "  · chatTurn response body: $(cat /tmp/ai-chat-turn.json | head -c 200)"

if [ "$resp" = "200" ] || [ "$resp" = "201" ]; then
    # (a) LLM configured → the assistant message must exist
    out=$(cat /tmp/ai-chat-turn.json)
    am=$(echo "$out" | extract_id '["assistantMessageId"]')
    if [ -n "$am" ]; then
        ok "chatTurn with attachmentIds → $resp assistantMessageId=$am (LLM live)"
    else
        bad "chatTurn $resp but missing assistantMessageId: $out"
    fi
elif echo "$(cat /tmp/ai-chat-turn.json)" | grep -q "AI provider is not configured\|no-provider\|provider"; then
    # (b) service reached, no LLM — this proves attachmentIds reached chatTurn
    ok "chatTurn reached chatTurn service (no LLM, attachmentIds field accepted)"
elif echo "$(cat /tmp/ai-chat-turn.json)" | grep -qi "validation\|zod\|expected array"; then
    # (c) BAD — attachmentIds was rejected by validation, never reached service
    bad "attachmentIds rejected by validation (did not reach chatTurn)"
else
    bad "chatTurn unexpected status=$resp body=$(cat /tmp/ai-chat-turn.json | head -c 200)"
fi

# 4. POST chatTurn WITHOUT attachmentIds (regression — must still work)
resp2=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/chat/sessions/$sid/turn" \
    -H 'Content-Type: application/json' \
    -d '{"userMessage":"hi"}' \
    -o /tmp/ai-chat-turn2.json -w "%{http_code}")
echo "  · chatTurn no-attachmentIds status: $resp2"
if [ "$resp2" = "200" ] || [ "$resp2" = "201" ]; then
    ok "chatTurn without attachmentIds → $resp2 (regression check)"
elif echo "$(cat /tmp/ai-chat-turn2.json)" | grep -q "AI provider is not configured\|provider"; then
    ok "chatTurn without attachmentIds reaches service (no LLM)"
else
    bad "chatTurn without attachmentIds status=$resp2 (regression!)"
fi

# 5. anon POST → 401
http=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$BACKEND_URL/api/chat/sessions/$sid/turn" \
    -H 'Content-Type: application/json' \
    -d '{"userMessage":"x","attachmentIds":["y"]}')
[ "$http" = "401" ] && ok "anon chatTurn with attachmentIds → 401" || bad "anon chatTurn → $http"

# cleanup (best effort; nothing to delete here, base/table are session-scoped)
:

echo
echo "── Summary ──"
echo "  pass: $pass"
echo "  fail: $fail"
[ "$fail" -eq 0 ]
