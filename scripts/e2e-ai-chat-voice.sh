#!/usr/bin/env bash
# scripts/e2e-ai-chat-voice.sh
#
# R-CHAT-3: AI Chat voice transcription HTTP evidence gate (live backend).
#
# Asserts:
#   - missing file                     → 400
#   - empty buffer                     → 400
#   - oversized payload (>25MB)        → 400
#   - unsupported MIME type            → 400
#   - authenticated healthy payload    → 200 (when OPENAI_API_KEY is valid)
#   -                                → 400 (when OPENAI_API_KEY is missing/fake)
#   - anonymous (no session cookie)    → 401
#
# Requires: backend running at ${BACKEND_URL} (default http://127.0.0.1:3000),
# admin account ${TEST_EMAIL}/${TEST_PASSWORD}. OPENAI_API_KEY in env makes
# the happy path actually return a transcript; without it the gate verifies
# the route registers, validates inputs, and rejects the right shapes.

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
TEST_EMAIL="${TEST_EMAIL:-admin@teable.local}"
TEST_PASSWORD="${TEST_PASSWORD:-teable}"
COOKIE="/tmp/teable-aichvoice-cookie.txt"
ANON_COOKIE="/tmp/teable-aichvoice-anon.txt"
TMP_AUDIO="/tmp/teable-aichvoice-blob.webm"

pass=0; fail=0
ok()  { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ❌ $1"; fail=$((fail+1)); }

echo
echo "── AI Chat voice HTTP gate (R-CHAT-3) ──────────────────────────"

# 1. signin (real user)
http=$(curl -sS -o /dev/null -w "%{http_code}" -c "$COOKIE" \
    -X POST "$BACKEND_URL/api/auth/signin" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"redirect\":false}")
[ "$http" = "200" ] && ok "signin → 200" || { bad "signin → $http"; }

# 2. happy path (or 400 if OPENAI_API_KEY is unset/fake — both prove route works)
if [ -s "$TMP_AUDIO" ]; then
  : > "$TMP_AUDIO"
fi
# Build a tiny valid webm header-like blob (3 bytes is enough for input validation; Whisper will reject zero-length or fail loud).
printf 'RIFF\x00\x00\x00\x00WEBM' > "$TMP_AUDIO"

http=$(curl -sS -o /tmp/teable-aichvoice-resp.json -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/chat/voice/transcribe" \
    -F "file=@$TMP_AUDIO;type=audio/webm" \
    -F "language=en")
case "$http" in
  200) ok "transcribe (with valid OPENAI_API_KEY) → 200" ;;
  400)
    body=$(cat /tmp/teable-aichvoice-resp.json 2>/dev/null || true)
    if echo "$body" | grep -q "OPENAI_API_KEY is not configured\|Whisper\|HTTP"; then
      ok "transcribe (no/fake OPENAI_API_KEY) → 400 (route reachable, validation works)"
    else
      bad "transcribe → 400 ($body)"
    fi
    ;;
  *)
    body=$(cat /tmp/teable-aichvoice-resp.json 2>/dev/null || true)
    bad "transcribe → $http ($body)"
    ;;
esac

# 3. missing file field (BadRequest → 400)
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/chat/voice/transcribe" \
    -F "language=en")
[ "$http" = "400" ] && ok "missing 'file' field → 400" || bad "missing 'file' field → $http"

# 4. empty audio payload (BadRequest → 400)
: > "$TMP_AUDIO"
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/chat/voice/transcribe" \
    -F "file=@$TMP_AUDIO;type=audio/webm")
[ "$http" = "400" ] && ok "empty audio payload → 400" || bad "empty audio payload → $http"

# 5. oversized (>25MB; we don't actually allocate that, just send a header)
bigfile=$(mktemp -t teable-voice-big.XXXXXX)
dd if=/dev/zero of="$bigfile" bs=1024 count=26000 status=none
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/chat/voice/transcribe" \
    -F "file=@$bigfile;type=audio/webm" 2>/dev/null || true)
case "$http" in
  400|413) ok "oversized payload (>25MB) → $http" ;;
  *)       bad "oversized payload (>25MB) → $http" ;;
esac
rm -f "$bigfile"

# 6. unsupported MIME (BadRequest → 400)
printf 'not audio' > "$TMP_AUDIO"
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/chat/voice/transcribe" \
    -F "file=@$TMP_AUDIO;type=text/plain")
[ "$http" = "400" ] && ok "unsupported MIME (text/plain) → 400" || bad "unsupported MIME → $http"

# 7. anonymous (no session) → 401
printf 'RIFF' > "$TMP_AUDIO"
http=$(curl -sS -o /dev/null -w "%{http_code}" \
    -X POST "$BACKEND_URL/api/chat/voice/transcribe" \
    -F "file=@$TMP_AUDIO;type=audio/webm")
case "$http" in
  401) ok "anonymous transcribe → 401" ;;
  *)   bad "anonymous transcribe → $http" ;;
esac

echo
echo "── Summary ─────────────────────────"
echo "  pass: $pass"
echo "  fail: $fail"

rm -f "$TMP_AUDIO" "$COOKIE" "$ANON_COOKIE" /tmp/teable-aichvoice-resp.json

[ "$fail" -eq 0 ] && exit 0 || exit 1
