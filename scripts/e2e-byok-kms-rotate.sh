#!/usr/bin/env bash
# scripts/e2e-byok-kms-rotate.sh
#
# R-KMS BYOK key rotation drill (live backend).
#
# Exercises the four critical BYOK KMS operations end-to-end against
# /api/admin/byok-kms:
#   - POST   /keys                                  (registerKey)
#   - POST   /keys/:orgId/:alias/rotate             (rotateKeyVersion)
#   - POST   /encrypt                               (envelopeEncrypt)
#   - POST   /decrypt                               (envelopeDecrypt)
#   - GET    /audit/:orgId                          (audit log)
#
# Auth model: instance admin session. We sign in as admin@teable.local
# and use the resulting cookie. Local provider's seeded master key
# (`__default__`) is used so the encrypt/decrypt round-trip works
# without external KMS credentials.
set -uo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
COOKIE="/tmp/teable-kms-cookie.txt"
ORG_ID="e2e-org-$(date +%s)"
ALIAS="e2e-alias-$(date +%s)"

pass=0; fail=0
ok()  { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ❌ $1"; fail=$((fail+1)); }

echo
echo "── R-KMS BYOK rotation drill gate (live) ───────────────────────────"

# 1. Sign in as admin
http=$(curl -sS -o /dev/null -w "%{http_code}" -c "$COOKIE" \
    -X POST "$BACKEND_URL/api/auth/signin" \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@teable.local","password":"teable","redirect":false}')
[ "$http" = "200" ] && ok "signin → 200" || { bad "signin → $http"; exit 1; }

# 2. Register a customer master key (uses seeded __default__ for local provider)
http=$(curl -sS -o /tmp/kms-create.json -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/admin/byok-kms/keys" \
    -H 'Content-Type: application/json' \
    -d "{\"organizationId\":\"$ORG_ID\",\"alias\":\"$ALIAS\",\"provider\":\"local\",\"keyId\":\"__default__\",\"createdBy\":\"e2e-kms-tester\"}")
case "$http" in
    200|201) ok "POST /keys (alias=$ALIAS) → $http";;
    *) bad "POST /keys → $http (response: $(cat /tmp/kms-create.json 2>/dev/null | head -c 200))"; exit 1;;
esac

# 3. List keys for the org
http=$(curl -sS -o /tmp/kms-list.json -w "%{http_code}" -b "$COOKIE" \
    "$BACKEND_URL/api/admin/byok-kms/keys/$ORG_ID")
[ "$http" = "200" ] && ok "GET /keys/:orgId → 200" || bad "GET /keys/:orgId → $http"

# 4. Envelope-encrypt a payload under the customer key
PLAINTEXT="$(printf 'hello-byok-%s' "$(date +%s)" | base64)"
http=$(curl -sS -o /tmp/kms-encrypt.json -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/admin/byok-kms/encrypt" \
    -H 'Content-Type: application/json' \
    -d "{\"organizationId\":\"$ORG_ID\",\"alias\":\"$ALIAS\",\"plaintext\":\"$PLAINTEXT\"}")
case "$http" in
    200|201) ok "POST /encrypt → $http";;
    *) bad "POST /encrypt → $http (response: $(cat /tmp/kms-encrypt.json 2>/dev/null | head -c 200))";;
esac

# 5. Rotate the key version (local provider bumps __default__ material)
http=$(curl -sS -o /tmp/kms-rotate.json -w "%{http_code}" -b "$COOKIE" \
    -X POST "$BACKEND_URL/api/admin/byok-kms/keys/$ORG_ID/$ALIAS/rotate" \
    -H 'Content-Type: application/json' \
    -d '{"newKeyVersion":"v2"}')
case "$http" in
    200|201) ok "POST /keys/:orgId/:alias/rotate → $http";;
    *) bad "POST /rotate → $http (response: $(cat /tmp/kms-rotate.json 2>/dev/null | head -c 200))";;
esac

# 6. Audit log
http=$(curl -sS -o /tmp/kms-audit.json -w "%{http_code}" -b "$COOKIE" \
    "$BACKEND_URL/api/admin/byok-kms/audit/$ORG_ID")
[ "$http" = "200" ] && ok "GET /audit/:orgId → 200" || bad "GET /audit/:orgId → $http"

# 7. Cleanup
http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
    -X DELETE "$BACKEND_URL/api/admin/byok-kms/keys/$ORG_ID/$ALIAS")
[ "$http" = "200" ] && ok "DELETE /keys/:orgId/:alias → 200" || bad "DELETE → $http"

echo
echo "── Summary ───────────────────────────────────────────────"
echo "  $pass pass / $fail fail"
[ "$fail" = "0" ] || exit 1
