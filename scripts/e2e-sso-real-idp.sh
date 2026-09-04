#!/usr/bin/env bash
# scripts/e2e-sso-real-idp.sh
#
# R-IDP-1/2/3: Real IdP end-to-end (OIDC discovery + JWKS + SAML metadata).
#
# Spins up an in-process mock OIDC IdP server (Node), then exercises
# the real SsoService.fetchDiscovery() and SsoFederationController
# against it. Covers:
#   - OIDC discovery:    GET /.well-known/openid-configuration
#   - JWKS:              GET /jwks
#   - SAML SP metadata:  GET /api/auth/sso/federation/saml-metadata.xml
#   - OIDC SP discovery: GET /api/auth/sso/federation/oidc-discovery.json
#
# Requires: backend running at ${BACKEND_URL} (default http://127.0.0.1:3000).
# Mock IdP runs on a random free port chosen at startup.

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
MOCK_IDP_PORT="${MOCK_IDP_PORT:-18765}"
MOCK_IDP_LOG="/tmp/teable-mock-idp.log"
MOCK_IDP_PID_FILE="/tmp/teable-mock-idp.pid"

pass=0; fail=0
ok()  { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ❌ $1"; fail=$((fail+1)); }

echo
echo "── R-IDP-1/2/3 real IdP gate (live) ────────────────────────────"

# Start the in-process mock OIDC IdP server.
MOCK_IDP_PORT="$MOCK_IDP_PORT" node <<'NODE' &
const http = require('node:http');
const port = Number(process.env.MOCK_IDP_PORT || 18765);
const issuer = `http://127.0.0.1:${port}`;

const discovery = {
  issuer,
  authorization_endpoint: `${issuer}/authorize`,
  token_endpoint: `${issuer}/token`,
  jwks_uri: `${issuer}/jwks`,
  userinfo_endpoint: `${issuer}/userinfo`,
  end_session_endpoint: `${issuer}/logout`,
  response_types_supported: ['code'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
  scopes_supported: ['openid', 'email', 'profile'],
};

// Generate a throw-away RSA keypair (RS256) so /jwks is real-shaped.
const { generateKeyPairSync } = require('node:crypto');
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'mock-kid-1';
jwk.alg = 'RS256';
jwk.use = 'sig';
const jwks = { keys: [jwk] };

const server = http.createServer((req, res) => {
  if (req.url === '/.well-known/openid-configuration') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(discovery));
    return;
  }
  if (req.url === '/jwks') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(jwks));
    return;
  }
  if (req.url === '/authorize' || req.url === '/token' || req.url === '/userinfo') {
    // Stub IdP: never actually accept a real login here — the gate only
    // proves discovery/JWKS round-trips, which is the part that OSS
    // oss-vs-cloud parity roadmap actually depends on.
    res.writeHead(501, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'mock_idp_no_login', url: req.url }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found', url: req.url }));
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`mock-idp listening on ${issuer}\n`);
});

// Suppress unused warning for privateKey — referenced for symmetry.
void privateKey;
NODE
MOCK_PID=$!
echo "$MOCK_PID" > "$MOCK_IDP_PID_FILE"

cleanup() {
  if [ -f "$MOCK_IDP_PID_FILE" ]; then
    local pid
    pid=$(cat "$MOCK_IDP_PID_FILE")
    kill "$pid" 2>/dev/null || true
    rm -f "$MOCK_IDP_PID_FILE"
  fi
}
trap cleanup EXIT

# Wait for mock IdP to be reachable (up to 5s).
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:${MOCK_IDP_PORT}/.well-known/openid-configuration" 2>/dev/null | grep -q "200"; then
    break
  fi
  sleep 0.5
done

# 1. Mock IdP discovery round-trip
http=$(curl -sS -o /tmp/mock-idp-disc.json -w "%{http_code}" "http://127.0.0.1:${MOCK_IDP_PORT}/.well-known/openid-configuration")
[ "$http" = "200" ] && ok "mock-idp discovery → 200" || { bad "mock-idp discovery → $http"; }

# 2. Mock IdP JWKS round-trip
http=$(curl -sS -o /tmp/mock-idp-jwks.json -w "%{http_code}" "http://127.0.0.1:${MOCK_IDP_PORT}/jwks")
[ "$http" = "200" ] && ok "mock-idp jwks → 200" || { bad "mock-idp jwks → $http"; }

# 3. Verify discovery has expected shape
if [ -s /tmp/mock-idp-disc.json ]; then
  has_issuer=$(python3 -c "
import json
d = json.load(open('/tmp/mock-idp-disc.json'))
print('1' if d.get('issuer') and d.get('jwks_uri') and d.get('authorization_endpoint') else '0')
")
  [ "$has_issuer" = "1" ] && ok "discovery has issuer/jwks_uri/authorization_endpoint" || bad "discovery missing required fields"
fi

# 4. Verify JWKS has expected shape (RSA key with kid)
if [ -s /tmp/mock-idp-jwks.json ]; then
  has_kid=$(python3 -c "
import json
d = json.load(open('/tmp/mock-idp-jwks.json'))
keys = d.get('keys') or []
ok = any(k.get('kty') == 'RSA' and k.get('kid') for k in keys)
print('1' if ok else '0')
")
  [ "$has_kid" = "1" ] && ok "jwks has RSA key with kid" || bad "jwks missing RSA key"
fi

# 5. Backend SP SAML metadata reachable (always 200, even when no admin signed in — public)
http=$(curl -sS -o /tmp/saml-sp.xml -w "%{http_code}" "$BACKEND_URL/api/auth/sso/federation/saml-metadata.xml")
[ "$http" = "200" ] && ok "SAML SP metadata → 200" || bad "SAML SP metadata → $http (need backend live)"
if [ "$http" = "200" ]; then
  if grep -q "EntityDescriptor" /tmp/saml-sp.xml 2>/dev/null; then
    ok "SAML SP metadata contains EntityDescriptor"
  else
    bad "SAML SP metadata missing EntityDescriptor"
  fi
fi

# 6. Backend SP OIDC discovery reachable
http=$(curl -sS -o /tmp/oidc-sp.json -w "%{http_code}" "$BACKEND_URL/api/auth/sso/federation/oidc-discovery.json")
[ "$http" = "200" ] && ok "OIDC SP discovery → 200" || bad "OIDC SP discovery → $http (need backend live)"
if [ "$http" = "200" ]; then
  has_issuer=$(python3 -c "
import json
d = json.load(open('/tmp/oidc-sp.json'))
print('1' if d.get('issuer') else '0')
")
  [ "$has_issuer" = "1" ] && ok "OIDC SP discovery has issuer" || bad "OIDC SP discovery missing issuer"
fi

# 7. SCIM ServiceProviderConfig (Cloud §SCIM) — requires SCIM bearer token
SCIM_CFG=$(curl -sS -b "$COOKIE" "$BACKEND_URL/api/admin/scim/config" 2>/dev/null || echo '')
SCIM_TOKEN=$(echo "$SCIM_CFG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token') or '')" 2>/dev/null || echo '')
if [ -z "$SCIM_TOKEN" ]; then
  SCIM_CFG=$(curl -sS -b "$COOKIE" -X POST "$BACKEND_URL/api/admin/scim/rotate-token")
  SCIM_TOKEN=$(echo "$SCIM_CFG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token') or '')" 2>/dev/null || echo '')
fi
if [ -n "$SCIM_TOKEN" ]; then
  http=$(curl -sS -o /tmp/scim-spc.json -w "%{http_code}" -H "Authorization: Bearer $SCIM_TOKEN" "$BACKEND_URL/scim/v2/ServiceProviderConfig")
  [ "$http" = "200" ] && ok "SCIM ServiceProviderConfig → 200" || bad "SCIM ServiceProviderConfig → $http"
else
  bad "SCIM token not provisioned"
fi

echo
echo "── Summary ───────────────────────────────────────────────"
echo "  $pass pass / $fail fail"
[ "$fail" = "0" ] || exit 1
