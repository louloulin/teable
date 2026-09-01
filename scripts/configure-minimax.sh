#!/usr/bin/env bash
set -euo pipefail

# Configure an OpenAI-compatible MiniMax provider through the authenticated
# Teable admin API. The key is read from the environment and never persisted
# in this script or echoed to stdout.
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/teable-admin.cookies}"
MINIMAX_API_KEY="${MINIMAX_API_KEY:?set MINIMAX_API_KEY in the environment}"
MINIMAX_BASE_URL="${MINIMAX_BASE_URL:-https://api.minimaxi.com/v1}"
MINIMAX_MODEL="${MINIMAX_MODEL:-MiniMax-M3}"

curl --fail-with-body --silent --show-error \
  -X PUT "$BASE_URL/api/admin/ai-setting/gateway" \
  -b "$COOKIE_JAR" \
  -H 'content-type: application/json' \
  --data-raw "$(printf '{"apiKey":"%s","baseUrl":"%s"}' "$MINIMAX_API_KEY" "$MINIMAX_BASE_URL")" >/dev/null

curl --fail-with-body --silent --show-error \
  -X PUT "$BASE_URL/api/admin/ai-setting/default-model" \
  -b "$COOKIE_JAR" \
  -H 'content-type: application/json' \
  --data-raw "$(printf '{"model":"%s","smartLevel":"high"}' "$MINIMAX_MODEL")" >/dev/null

curl --fail-with-body --silent --show-error \
  -X POST "$BASE_URL/api/admin/ai-setting/enable" \
  -b "$COOKIE_JAR" >/dev/null

printf 'MiniMax AI gateway configured: model=%s baseUrl=%s\n' "$MINIMAX_MODEL" "$MINIMAX_BASE_URL"
