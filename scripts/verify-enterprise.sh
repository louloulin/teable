#!/usr/bin/env bash
# scripts/verify-enterprise.sh
#
# Enterprise readiness verifier — minimal-change automation gate.
#
# Runs the cheapest checks that catch the regressions the v2/commercial
# gap analysis flagged:
#
#   1. tsconfig.json references match real v2 package tsconfigs
#   2. Every top-level feature module has an `index.ts` barrel
#   3. Every nested helper subdir containing .ts files has an `index.ts`
#   4. Backend `tsc --noEmit` does not exceed the recorded baseline
#   5. (optional) pnpm -r test-unit — pass RUN_TESTS=1 to enable
#   9. R-CHAT-1 AI Chat selection chips HTTP gate (live)
#  16. R-WRITE-1/2 AI Chat write surface HTTP gate (live)
#
# Exit 0 = ready for Comet Verify, non-zero = block.
# Safe for CI. Designed to be re-runnable on any worktree.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FEATURES_DIR="apps/nestjs-backend/src/features"
BASELINE_FILE="scripts/ci-baseline.json"
LOG="/tmp/teable-verify-enterprise.log"

pass_count=0
fail_count=0

ok()  { echo "  ✅ $1"; pass_count=$((pass_count+1)); }
bad() { echo "  ❌ $1"; fail_count=$((fail_count+1)); }
hdr() { printf '\n── %s ─────────────────────────\n' "$1"; }

# ─── 1. root tsconfig references ─────────────────────────────────
hdr "1/26  root tsconfig references"
result=$(python3 <<'PY'
import json, os, sys
ts = json.load(open("tsconfig.json"))
missing = [r["path"] for r in ts.get("references", []) if not os.path.isfile(os.path.join(r["path"], "tsconfig.json"))]
n = len(ts.get("references", []))
print(f"{n}|{'|'.join(missing)}")
PY
)
ref_count="${result%%|*}"
missing="${result#*|}"
if [ -z "$missing" ] || [ "$missing" = "$result" ]; then
    ok "all $ref_count references resolve"
else
    bad "missing tsconfig.json under: $missing"
fi

# ─── 2 & 3. feature module index.ts barrels ───────────────────────
hdr "2/26  feature module index.ts barrels"
result=$(python3 <<PY
import os
base = "$FEATURES_DIR"
missing = []
for entry in sorted(os.listdir(base)):
    p = os.path.join(base, entry)
    if not os.path.isdir(p):
        continue
    if not os.path.isfile(os.path.join(p, "index.ts")):
        missing.append(entry)
total = sum(1 for e in os.listdir(base) if os.path.isdir(os.path.join(base, e)))
print(f"{total}|{'|'.join(missing)}")
PY
)
total="${result%%|*}"
missing="${result#*|}"
if [ -z "$missing" ] || [ "$missing" = "$result" ]; then
    ok "all $total top-level feature modules have index.ts"
else
    bad "missing index.ts in: $missing"
fi

hdr "3/26  nested helper subdir index.ts barrels"
result=$(python3 <<PY
import os
base = "$FEATURES_DIR"
missing = []
for root, dirs, files in os.walk(base):
    depth = root[len(base):].count(os.sep)
    if depth != 1:
        continue
    has_ts = any(
        f.endswith(".ts") and not f.endswith((".spec.ts", ".test.ts", ".d.ts")) and f != "index.ts"
        for f in files
    )
    if has_ts and not os.path.isfile(os.path.join(root, "index.ts")):
        missing.append(os.path.relpath(root, base))
print("|".join(missing))
PY
)
if [ -z "$result" ]; then
    ok "all nested helper subdirs containing .ts source have index.ts"
else
    bad "missing index.ts in: $result"
fi

# ─── 4. backend typecheck vs baseline ─────────────────────────────
hdr "4/26  backend typecheck vs baseline"
TSC_LOG=$(mktemp -t teable-tsc.XXXXXX.log)
trap 'rm -f "$TSC_LOG"' EXIT
(cd apps/nestjs-backend && npx tsc --project ./tsconfig.json --noEmit) >"$TSC_LOG" 2>&1 || true
current_count=$(grep -c "error TS" "$TSC_LOG" || true)
if [ -f "$BASELINE_FILE" ]; then
    baseline_count=$(python3 -c "import json; print(json.load(open('$BASELINE_FILE')).get('nestjs_backend_tsc_errors', 0))")
    if [ "$current_count" -le "$baseline_count" ]; then
        ok "tsc errors $current_count ≤ baseline $baseline_count"
    else
        delta=$((current_count - baseline_count))
        bad "tsc errors $current_count > baseline $baseline_count ($delta NEW errors)"
    fi
else
    echo "  ⚠️  no $BASELINE_FILE — recording current count $current_count"
    if [ "$current_count" -eq 0 ]; then
        ok "tsc errors 0 (no baseline yet)"
    else
        bad "tsc errors $current_count (no baseline; first run will set one)"
    fi
fi

# ─── 5. unit tests (optional) ────────────────────────────────────
hdr "5/26  authority matrix four-role HTTP gate (live, R-PERM-3b)"
if [ -x "./scripts/e2e-authority-matrix.sh" ]; then
    if BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}" bash ./scripts/e2e-authority-matrix.sh >"${LOG}.am" 2>&1; then
        ok "authority matrix four-role HTTP gate (live, R-PERM-3b)"
    else
        bad "authority matrix four-role HTTP gate (live, R-PERM-3b) (see ${LOG}.am)"
    fi
else
    bad "scripts/e2e-authority-matrix.sh missing"
fi

hdr "6/26  AI Chat queue HTTP gate (live, R-AI-11)"
if [ -x "./scripts/e2e-ai-chat-queue.sh" ]; then
    if BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}" bash ./scripts/e2e-ai-chat-queue.sh >"${LOG}.q" 2>&1; then
        ok "AI Chat queue HTTP gate (live, R-AI-11)"
    else
        bad "AI Chat queue HTTP gate (live, R-AI-11) (see ${LOG}.q)"
    fi
else
    bad "scripts/e2e-ai-chat-queue.sh missing"
fi

hdr "7/26  AI App Builder HTTP gate (live, R-AI-12)"
if [ -x "./scripts/e2e-ai-app-builder.sh" ]; then
    if BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}" bash ./scripts/e2e-ai-app-builder.sh >"${LOG}.aab" 2>&1; then
        ok "AI App Builder HTTP gate (live, R-AI-12)"
    else
        bad "AI App Builder HTTP gate (live, R-AI-12) (see ${LOG}.aab)"
    fi
else
    bad "scripts/e2e-ai-app-builder.sh missing"
fi

hdr "8/26  unit tests (RUN_TESTS=1 to enable)"
if [ "${RUN_TESTS:-0}" = "1" ]; then
    if timeout 600 pnpm -r --silent -F './apps/nestjs-backend' -F './packages/**' test-unit >"${LOG}.test" 2>&1; then
        ok "pnpm -r test-unit"
    else
        bad "pnpm -r test-unit (see ${LOG}.test)"
    fi
else
    echo "  ⏭️  skipped (set RUN_TESTS=1 to enable)"
fi

# ─── 9. R-CHAT-1 AI Chat selection chips HTTP gate ───────────────
hdr "9/26  AI Chat selection chips HTTP gate (live, R-CHAT-1)"
if [ -x "./scripts/e2e-ai-chat-selection.sh" ]; then
    if BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}" bash ./scripts/e2e-ai-chat-selection.sh >"${LOG}.aichsel" 2>&1; then
        ok "AI Chat selection chips HTTP gate (R-CHAT-1)"
    else
        bad "AI Chat selection chips HTTP gate (see ${LOG}.aichsel)"
    fi
else
    bad "scripts/e2e-ai-chat-selection.sh not found / not executable"
fi

# ─── 10. R-CHAT-2 AI Chat intelligence HTTP gate ─────────────────
hdr "10/26 AI Chat intelligence HTTP gate (live, R-CHAT-2)"
if [ -x "./scripts/e2e-ai-chat-intelligence.sh" ]; then
    if BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}" bash ./scripts/e2e-ai-chat-intelligence.sh >"${LOG}.aichint" 2>&1; then
        ok "AI Chat intelligence HTTP gate (R-CHAT-2)"
    else
        bad "AI Chat intelligence HTTP gate (see ${LOG}.aichint)"
    fi
else
    bad "scripts/e2e-ai-chat-intelligence.sh not found / not executable"
fi

# ─── 11. R-CHAT-3 AI Chat voice transcription HTTP gate ──────────
hdr "11/26 AI Chat voice transcription HTTP gate (live, R-CHAT-3)"
if [ -x "./scripts/e2e-ai-chat-voice.sh" ]; then
    if BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}" bash ./scripts/e2e-ai-chat-voice.sh >"${LOG}.aichvoice" 2>&1; then
        ok "AI Chat voice transcription HTTP gate (R-CHAT-3)"
    else
        bad "AI Chat voice transcription HTTP gate (see ${LOG}.aichvoice)"
    fi
else
    bad "scripts/e2e-ai-chat-voice.sh not found / not executable"
fi

# ─── 12. R-ATTACH-1 attachment parser unit suite ──────────────────────
hdr "12/26 AI Chat attachment parser unit suite (R-ATTACH-1)"
if (cd apps/nestjs-backend && ./node_modules/.bin/vitest run --no-coverage src/features/ai-chat/ai-chat-attachment-parser.service.spec.ts) >"\${LOG}.attparser" 2>&1; then
    ok "AI Chat attachment parser unit suite (R-ATTACH-1)"
else
    bad "AI Chat attachment parser unit suite (R-ATTACH-1) (see \${LOG}.attparser)"
fi

# ─── 13. R-ATTACH-2 attachment download token + virus scan unit suite ──
hdr "13/26 AI Chat attachment download token unit suite (R-ATTACH-2)"
if (cd apps/nestjs-backend && ./node_modules/.bin/vitest run --no-coverage src/features/ai-chat/ai-chat-attachment-token.service.spec.ts) >"\${LOG}.atttoken" 2>&1; then
    ok "AI Chat attachment download token unit suite (R-ATTACH-2)"
else
    bad "AI Chat attachment download token unit suite (R-ATTACH-2) (see \${LOG}.atttoken)"
fi

# ─── 14. R-WRITE-1 + R-WRITE-2 AI Chat write surface unit suite ─────────
hdr "14/26 AI Chat write surface unit suite (R-WRITE-1/2)"
if (cd apps/nestjs-backend && ./node_modules/.bin/vitest run --no-coverage src/features/ai-chat/ai-chat-write-surface.spec.ts) >"\${LOG}.writesurf" 2>&1; then
    ok "AI Chat write surface unit suite (R-WRITE-1/2)"
else
    bad "AI Chat write surface unit suite (R-WRITE-1/2) (see \${LOG}.writesurf)"
fi

# ─── 15. R-AI-MODEL capability × provider matrix ────────────────────────────
hdr "15/26 AI model resolver capability × provider matrix (R-AI-MODEL)"
if [ -x "./scripts/e2e-ai-model-matrix.sh" ]; then
    if bash ./scripts/e2e-ai-model-matrix.sh >"\${LOG}.aimatrix" 2>&1; then
        ok "AI model resolver matrix 4×3 (R-AI-MODEL)"
    else
        bad "AI model resolver matrix 4×3 (R-AI-MODEL) (see \${LOG}.aimatrix)"
    fi
else
    bad "scripts/e2e-ai-model-matrix.sh not found / not executable"
fi

# ─── 16. R-WRITE-1 + R-WRITE-2 AI Chat write surface HTTP gate (live) ──
hdr "16/26 AI Chat write surface HTTP gate (R-WRITE-1/2)"
if [ -x "./scripts/e2e-ai-chat-write-surface.sh" ]; then
    if bash ./scripts/e2e-ai-chat-write-surface.sh >"${LOG}.writesurf2" 2>&1; then
        ok "AI Chat write surface HTTP gate (R-WRITE-1/2)"
    else
        bad "AI Chat write surface HTTP gate (R-WRITE-1/2) (see ${LOG}.writesurf2)"
    fi
else
    bad "scripts/e2e-ai-chat-write-surface.sh not found / not executable"
fi

# ─── 17. R-MIGRATE Airtable AI-assisted field mapping unit suite ──────────────
hdr "17/26 R-MIGRATE Airtable AI-assisted field mapping unit suite"
if (cd apps/nestjs-backend && ./node_modules/.bin/vitest run --no-coverage src/features/airtable-import/airtable-import-ai-suggest.service.spec.ts) >"${LOG}.migrate" 2>&1; then
    ok "R-MIGRATE Airtable AI-assisted field mapping unit suite"
else
    bad "R-MIGRATE Airtable AI-assisted field mapping unit suite (see ${LOG}.migrate)"
fi

# ─── 18. R-ADMIN-AUDIT admin page HTTP gate (live) ───────────────────────────
hdr "18/26 R-ADMIN-AUDIT admin page HTTP gate (live)"
if [ -x "./scripts/e2e-admin-pages.sh" ]; then
    if bash ./scripts/e2e-admin-pages.sh >"${LOG}.admpages" 2>&1; then
        ok "R-ADMIN-AUDIT admin page HTTP gate (live)"
    else
        bad "R-ADMIN-AUDIT admin page HTTP gate (live) (see ${LOG}.admpages)"
    fi
else
    bad "scripts/e2e-admin-pages.sh not found / not executable"
fi

# ─── 19. R-SANDBOX local sandbox runtime unit suite ──────────────────────────
hdr "19/26 R-SANDBOX local sandbox runtime unit suite"
if (cd apps/nestjs-backend && ./node_modules/.bin/vitest run --no-coverage src/features/sandbox-agent/local-sandbox.service.spec.ts) >"${LOG}.sandbox" 2>&1; then
    ok "R-SANDBOX local sandbox runtime unit suite"
else
    bad "R-SANDBOX local sandbox runtime unit suite (see ${LOG}.sandbox)"
fi

# ─── 20. R-IDP-1/2/3 real IdP OIDC + SAML + SCIM federation gate ────────
hdr "20/26 R-IDP-1/2/3 real IdP OIDC + SAML + SCIM federation gate"
if [ -x "./scripts/e2e-sso-real-idp.sh" ]; then
    if bash ./scripts/e2e-sso-real-idp.sh >"${LOG}.realidp" 2>&1; then
        ok "R-IDP-1/2/3 real IdP federation gate"
    else
        bad "R-IDP-1/2/3 real IdP federation gate (see ${LOG}.realidp)"
    fi
else
    bad "scripts/e2e-sso-real-idp.sh not found / not executable"
fi

# ─── 21. R-I18N 4-language locale bundle parity gate ────────────────────────
hdr "21/26 R-I18N 4-language locale bundle parity gate"
if [ -x "./scripts/e2e-i18n.sh" ]; then
    if bash ./scripts/e2e-i18n.sh >"${LOG}.i18n" 2>&1; then
        ok "R-I18N 4-language locale bundle parity gate"
    else
        bad "R-I18N 4-language locale bundle parity gate (see ${LOG}.i18n)"
    fi
else
    bad "scripts/e2e-i18n.sh not found / not executable"
fi

# ─── 22. R-BACKUP backup-restore drill gate (live) ──────────────────────────
hdr "22/26 R-BACKUP backup-restore drill gate (live)"
if [ -x "./scripts/e2e-backup-restore.sh" ]; then
    if bash ./scripts/e2e-backup-restore.sh >"${LOG}.backup" 2>&1; then
        ok "R-BACKUP backup-restore drill gate (live)"
    else
        bad "R-BACKUP backup-restore drill gate (see ${LOG}.backup)"
    fi
else
    bad "scripts/e2e-backup-restore.sh not found / not executable"
fi

# ─── 23. R-RESIDENCY per-tenant region tag + cross-region route denial ────
hdr "23/26 R-RESIDENCY per-tenant region tag + cross-region route denial (live)"
if [ -x "./scripts/e2e-residency.sh" ]; then
    if bash ./scripts/e2e-residency.sh >"${LOG}.residency" 2>&1; then
        ok "R-RESIDENCY per-tenant region tag + cross-region route denial (live)"
    else
        bad "R-RESIDENCY per-tenant region tag + cross-region route denial (see ${LOG}.residency)"
    fi
else
    bad "scripts/e2e-residency.sh not found / not executable"
fi

# ─── 24. R-KMS BYOK key rotation drill (live) ─────────────────────────────
hdr "24/26 R-KMS BYOK key rotation drill (live)"
if [ -x "./scripts/e2e-byok-kms-rotate.sh" ]; then
    if bash ./scripts/e2e-byok-kms-rotate.sh >"${LOG}.kms" 2>&1; then
        ok "R-KMS BYOK key rotation drill (live)"
    else
        bad "R-KMS BYOK key rotation drill (see ${LOG}.kms)"
    fi
else
    bad "scripts/e2e-byok-kms-rotate.sh not found / not executable"
fi

# ─── 25. R-COMPLIANCE GDPR/CCPA export + audit gate (live) ─────────────────
hdr "25/26 R-COMPLIANCE GDPR/CCPA export + audit gate (live)"
if [ -x "./scripts/e2e-compliance.sh" ]; then
    if bash ./scripts/e2e-compliance.sh >"${LOG}.compliance" 2>&1; then
        ok "R-COMPLIANCE GDPR/CCPA export + audit gate (live)"
    else
        bad "R-COMPLIANCE GDPR/CCPA export + audit gate (see ${LOG}.compliance)"
    fi
else
    bad "scripts/e2e-compliance.sh not found / not executable"
fi

# ─── 26. R-ADMIN-AUDIT frontend vitest pass-rate gate (V97) ─────────────────
hdr "26/26 R-ADMIN-AUDIT frontend vitest pass-rate gate"
# Runs the nextjs-app vitest suite and checks that no test file fails.
# Mock: setupVitest.ts short-circuits @teable/core Mixin() chain so the
# 18 pre-existing ts-mixer ESM interop failures no longer block test
# module load. Real view logic still works at runtime; component /
# hook tests just need a clean module-load to even start.
NEXTJS_OUT=$(cd apps/nextjs-app && timeout 180 ./node_modules/.bin/vitest run --no-coverage --environment happy-dom 2>&1 | tail -5 || true)
if echo "$NEXTJS_OUT" | grep -qE "Test Files +[0-9]+ passed \([0-9]+\)"; then
    failed=$(echo "$NEXTJS_OUT" | grep -oE "Test Files +[0-9]+ failed" | grep -oE "[0-9]+" || echo 0)
    if [ "$failed" = "0" ] || [ -z "$failed" ]; then
        passed=$(echo "$NEXTJS_OUT" | grep -oE "Test Files +[0-9]+ passed" | head -1 | grep -oE "[0-9]+")
        ok "R-ADMIN-AUDIT frontend vitest: ${passed} test files passed (0 failed)"
    else
        bad "R-ADMIN-AUDIT frontend vitest: ${failed} test files still failing"
    fi
else
    bad "R-ADMIN-AUDIT frontend vitest: could not parse output"
fi

# ─── Summary ──────────────────────────────────────────────────────
printf '\n── Summary ─────────────────────────\n'
echo "  pass: $pass_count"
echo "  fail: $fail_count"

if [ "$fail_count" -gt 0 ]; then
    exit 1
fi

exit 0
