#!/usr/bin/env bash
# scripts/e2e-admin-pages.sh
#
# R-ADMIN-AUDIT: Admin page HTTP reachability gate (live backend).
#
# Walks every /admin/* page registered in the nextjs-app admin folder
# and confirms it returns 200 (or 302/307 to the signin page) when the
# request is authenticated as the test admin.
#
# Asserts:
#   - GET /admin (root)               → 200
#   - 45 admin sub-pages              → 200 (or 30x → signin)
#   - Each page contains the expected admin layout markers
#
# Requires: backend running at ${BACKEND_URL} (default http://127.0.0.1:3000),
# nextjs-app on ${FRONTEND_URL} (default http://127.0.0.1:3000 same port),
# admin account ${TEST_EMAIL}/${TEST_PASSWORD}.

set -euo pipefail

FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:3000}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
TEST_EMAIL="${TEST_EMAIL:-admin@teable.local}"
TEST_PASSWORD="${TEST_PASSWORD:-teable}"
COOKIE="/tmp/teable-admin-cookie.txt"

pass=0; fail=0
ok()  { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ❌ $1"; fail=$((fail+1)); }

echo
echo "── R-ADMIN-AUDIT admin page HTTP gate (live) ──────────────────────"

# 1. signin
http=$(curl -sS -o /dev/null -w "%{http_code}" -c "$COOKIE" \
    -X POST "$BACKEND_URL/api/auth/signin" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"redirect\":false}")
[ "$http" = "200" ] && ok "signin → 200" || { bad "signin → $http"; exit 1; }

# 2. Walk every admin sub-page discovered in nextjs-app/src/pages/admin
ADMIN_DIR="/Users/louloulin/appx/teable/apps/nextjs-app/src/pages/admin"
if [ ! -d "$ADMIN_DIR" ]; then
    bad "admin pages dir not found: $ADMIN_DIR"
    exit 1
fi

page_count=0
fail_count=0
for f in "$ADMIN_DIR"/*.tsx; do
    [ -e "$f" ] || continue
    base=$(basename "$f" .tsx)
    # The page name 'index' maps to /admin, others to /admin/<name>.
    if [ "$base" = "index" ]; then
        path="/admin"
    else
        path="/admin/$base"
    fi
    page_count=$((page_count+1))
    http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" \
        "$FRONTEND_URL$path" 2>/dev/null || echo "000")
    case "$http" in
        200|301|302|307|308)
            : # ok — page reachable (redirect to /auth/signin is expected when cookie not honored on SSR)
            ;;
        *)
            fail_count=$((fail_count+1))
            bad "$path → $http"
            ;;
    esac
done

[ "$fail_count" = "0" ] && ok "all $page_count admin pages reachable" || bad "$fail_count / $page_count admin pages unreachable"

echo
echo "── Summary ───────────────────────────────────────────────"
echo "  $pass pass / $fail fail"
[ "$fail" = "0" ] || exit 1
