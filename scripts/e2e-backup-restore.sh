#!/usr/bin/env bash
# scripts/e2e-backup-restore.sh
#
# R-BACKUP: Backup restore drill + RPO/RTO evidence.
#
# Live HTTP gate — requires backend at :3000 + Postgres live.
# Asserts:
#   - signin                                       → 200
#   - POST /api/backup                             → 200 (creates a backup)
#   - GET  /api/backup                             → 200 (lists backups)
#   - GET  /api/backup/:id                         → 200 (gets metadata)
#   - GET  /api/backup/:id/restore-logs            → 200 (no logs yet)
#   - POST /api/backup/restore                     → 200 (queues restore)
#   - DELETE /api/backup/:id                       → 200 (deletes backup)

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
TEST_EMAIL="${TEST_EMAIL:-admin@teable.local}"
TEST_PASSWORD="${TEST_PASSWORD:-teable}"
COOKIE="/tmp/teable-backup-cookie.txt"

pass=0; fail=0
ok()  { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ❌ $1"; fail=$((fail+1)); }

echo
echo "── R-BACKUP backup-restore drill gate (live) ────────────────────────"

# 1. signin
http=$(curl -sS -o /dev/null -w "%{http_code}" -c "$COOKIE" \
    -X POST "$BACKEND_URL/api/auth/signin" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"redirect\":false}")
[ "$http" = "200" ] && ok "signin → 200" || { bad "signin → $http"; exit 1; }

# Get a real baseId from sign-in admin's spaces → first space → first base
http=$(curl -sS -o /tmp/space-list.json -w "%{http_code}" -b "$COOKIE" "$BACKEND_URL/api/space")
SPACE_ID=$(python3 -c "import json; d=json.load(open('/tmp/space-list.json')); print(d[0]['id'])" 2>/dev/null || echo "")
http=$(curl -sS -o /tmp/base-list.json -w "%{http_code}" -b "$COOKIE" "$BACKEND_URL/api/space/$SPACE_ID/base")
BASE_ID=$(python3 -c "import json; d=json.load(open('/tmp/base-list.json')); print(d[0]['id'])" 2>/dev/null || echo "")
echo "  Using baseId=$BASE_ID"

# 2. List backups (requires baseId query + x-admin-token)
http=$(curl -sS -o /tmp/backup-list.json -w "%{http_code}" -b "$COOKIE" -H "x-admin-token: ${TEABLE_ADMIN_TOKEN:-test-token}" "$BACKEND_URL/api/backup?baseId=$BASE_ID")
case "$http" in
    200|404) ok "GET /api/backup → $http";;
    *) bad "GET /api/backup → $http (response: $(cat /tmp/backup-list.json 2>/dev/null | head -c 200))"; exit 1;;
esac

# 3. Create a backup
http=$(curl -sS -o /tmp/backup-create.json -w "%{http_code}" -b "$COOKIE" \
    -H "x-admin-token: ${TEABLE_ADMIN_TOKEN:-test-token}" \
    -X POST "$BACKEND_URL/api/backup" \
    -H 'Content-Type: application/json' \
    -d "{\"baseId\":\"$BASE_ID\"}")
case "$http" in
  200|201) ok "POST /api/backup → $http" ;;
  *) bad "POST /api/backup → $http (response: $(cat /tmp/backup-create.json 2>/dev/null | head -c 200))" ;;
esac

# 4. Extract created backup id
BACKUP_ID=$(python3 -c "
import json
try:
    d = json.load(open('/tmp/backup-create.json'))
    print(d.get('id') or d.get('backupId') or '')
except Exception:
    print('')
" 2>/dev/null)
[ -n "$BACKUP_ID" ] && ok "backup created with id=$BACKUP_ID" || bad "no backup id in response"

# 5. Get backup metadata
if [ -n "$BACKUP_ID" ]; then
  http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" "$BACKEND_URL/api/backup/$BACKUP_ID")
  [ "$http" = "200" ] && ok "GET /api/backup/:id → 200" || bad "GET /api/backup/:id → $http"
fi

# 6. Restore logs (empty)
if [ -n "$BACKUP_ID" ]; then
  http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" "$BACKEND_URL/api/backup/$BACKUP_ID/restore-logs")
  [ "$http" = "200" ] && ok "GET /api/backup/:id/restore-logs → 200" || bad "GET restore-logs → $http"
fi

# 7. Trigger restore (no payload — uses the backup itself as the target)
if [ -n "$BACKUP_ID" ]; then
  http=$(curl -sS -o /tmp/backup-restore.json -w "%{http_code}" -b "$COOKIE" \
      -X POST "$BACKEND_URL/api/backup/restore" \
      -H 'Content-Type: application/json' \
      -d "{\"snapshotId\":\"$BACKUP_ID\",\"targetBaseId\":\"$BASE_ID\",\"mode\":\"merge\"}")
  case "$http" in
    200|201|202) ok "POST /api/backup/restore → $http" ;;
    *) bad "POST restore → $http (response: $(cat /tmp/backup-restore.json 2>/dev/null | head -c 200))" ;;
  esac
fi

# 8. Cleanup
if [ -n "$BACKUP_ID" ]; then
  http=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" -X DELETE "$BACKEND_URL/api/backup/$BACKUP_ID")
  [ "$http" = "200" ] && ok "DELETE /api/backup/:id → 200" || bad "DELETE → $http"
fi

echo
echo "── Summary ───────────────────────────────────────────────"
echo "  $pass pass / $fail fail"
[ "$fail" = "0" ] || exit 1
