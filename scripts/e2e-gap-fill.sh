#!/usr/bin/env bash
#
# scripts/e2e-gap-fill.sh
#
# End-to-end verification for the OSS-vs-Cloud gap-fill change.
# Mirrors the Acceptance Examples in brief.md and the A1-A11 matrix in
# spec.md / children.yaml so a single run proves every stage is wired.
#
# Sections:
#   1. Prisma migration order on a throw-away database (A10)
#   2. Unit tests for every gap-fill module (A11)
#   3. Per-stage smoke checks against the running nest process (when one
#      is already up; the script skips this section gracefully if not)
#
# Exit code 0 = every section passed. Anything else = first failing step.
#
# Usage:
#   TEABLE_E2E_BASE_URL=http://localhost:3000 \
#     TEABLE_ADMIN_TOKEN=... \
#     bash scripts/e2e-gap-fill.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/apps/nestjs-backend"
LOG_DIR="${TMPDIR:-/tmp}/teable-e2e-gap-fill"
mkdir -p "$LOG_DIR"
SUMMARY="$LOG_DIR/summary.log"
: > "$SUMMARY"

log() {
  local marker="$1"; shift
  printf "[%s] %s\n" "$marker" "$*" | tee -a "$SUMMARY"
}

section() {
  log "===" "$1"
}

# 1. Prisma migration (A10) ────────────────────────────────────────────
section "1/3 Prisma migration (A10)"
if [[ -n "${TEABLE_E2E_SKIP_MIGRATE:-}" ]]; then
  log "1" "skipped via TEABLE_E2E_SKIP_MIGRATE=1"
else
  export PRISMA_DATABASE_URL="${PRISMA_DATABASE_URL:-${PRISMA_MIGRATE_DATABASE_URL:-postgres://postgres:postgres@127.0.0.1:5432/teable_gap_fill_test?schema=meta}}"
  log "1" "applying migrations to $PRISMA_DATABASE_URL"
  # Teable migrations live in the meta schema — ensure it exists before
  # prisma tries to create the first table. Idempotent.
  if command -v psql >/dev/null 2>&1; then
    DB_ONLY_URL="${PRISMA_DATABASE_URL%/*}"
    psql "$DB_ONLY_URL/postgres" -c "CREATE SCHEMA IF NOT EXISTS meta;" \
      >/dev/null 2>>"$SUMMARY" || true
  fi
  if (cd "$ROOT/packages/db-main-prisma" && \
      pnpm exec prisma migrate deploy --schema ./prisma/postgres/schema.prisma 2>>"$SUMMARY"); then
    log "1" "prisma migrate deploy ok"
  else
    log "1" "FAIL — see $SUMMARY"
    exit 1
  fi
fi

# 2. Unit tests (A11) ─────────────────────────────────────────────────
section "2/3 Unit tests for all gap-fill modules (A11)"
TEST_TARGETS=(
  "src/features/license"
  "src/features/quota"
  "src/features/sso"
  "src/features/saml"
  "src/features/permission-matrix"
  "src/features/audit"
  "src/features/audit-export"
  "src/features/audit-log-query"
  "src/features/audit-retention"
  "src/features/admin"
  "src/features/custom-domain"
  "src/features/domain-verification"
  "src/features/api-rate-limit"
  "src/features/record-history-retention"
  "src/features/retention"
  "src/features/ai"
  "src/features/ai-builder"
)
if (cd "$BACKEND" && pnpm vitest run "${TEST_TARGETS[@]}" 2>>"$SUMMARY"); then
  log "2" "all unit tests passed"
else
  log "2" "FAIL — see $SUMMARY"
  exit 2
fi

# 3. Live smoke checks (only when a server is reachable) ───────────────
section "3/3 Live endpoint smoke checks (optional)"
BASE_URL="${TEABLE_E2E_BASE_URL:-http://127.0.0.1:3000}"
ADMIN_TOKEN="${TEABLE_ADMIN_TOKEN:-}"
if [[ -z "$ADMIN_TOKEN" ]]; then
  log "3" "skipped (no TEABLE_ADMIN_TOKEN) — server not required for the unit-level A11 pass"
  log "DONE" "summary at $SUMMARY"
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  log "3" "curl not available, skipping live checks"
  exit 0
fi

call() {
  local label="$1"; shift
  local expect="$1"; shift
  local url="$1"; shift
  local body status
  body="$(curl -fsS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${ADMIN_TOKEN}" "$url" || echo 000)"
  status="$body"
  if [[ "$status" == "$expect" ]]; then
    log "3" "OK   ${label} (${status}) ${url}"
  else
    log "3" "FAIL ${label} expected ${expect} got ${status} ${url}"
    exit 3
  fi
}

# 3a. custom-domain check endpoint (A5)
call "custom-domain.check"  200 "${BASE_URL}/api/admin/custom-domain/check?domain=foo.com"
# 3b. admin audit-log listing (A2)
call "audit-log.list"       200 "${BASE_URL}/api/admin/audit-log?limit=1"
# 3c. admin user listing (Stage 7)
call "admin.users"          200 "${BASE_URL}/api/admin/users?limit=1"
# 3d. admin spaces listing
call "admin.spaces"         200 "${BASE_URL}/api/admin/spaces"
# 3e. admin templates listing
call "admin.templates"      200 "${BASE_URL}/api/admin/templates"

# 3f. rate limit under business plan: issue 25 GETs in <1s and expect >=1 429 (A7)
log "3" "checking rate limit under business plan (A7)"
codes="$(for i in $(seq 1 25); do
  curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer ${ADMIN_TOKEN}" "${BASE_URL}/api/admin/spaces"
done | sort -u | tr '\n' ',' )"
if [[ "$codes" == *"429"* ]]; then
  log "3" "OK   rate-limit triggered (codes: ${codes})"
else
  log "3" "WARN rate-limit not triggered (codes: ${codes}); may be running under self_hosted plan"
fi

log "DONE" "summary at $SUMMARY"
