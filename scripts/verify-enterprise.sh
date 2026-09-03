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
hdr "1/8  root tsconfig references"
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
hdr "2/8  feature module index.ts barrels"
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

hdr "3/8  nested helper subdir index.ts barrels"
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
hdr "4/8  backend typecheck vs baseline"
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
hdr "5/8  authority matrix four-role HTTP gate (live)"
if [ -x "./scripts/e2e-authority-matrix.sh" ]; then
    if BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}" bash ./scripts/e2e-authority-matrix.sh >"${LOG}.am" 2>&1; then
        ok "authority matrix four-role HTTP gate"
    else
        bad "authority matrix four-role HTTP gate (see ${LOG}.am)"
    fi
else
    bad "scripts/e2e-authority-matrix.sh missing"
fi

hdr "6/8  AI Chat queue HTTP gate (live)"
if [ -x "./scripts/e2e-ai-chat-queue.sh" ]; then
    if BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}" bash ./scripts/e2e-ai-chat-queue.sh >"${LOG}.q" 2>&1; then
        ok "AI Chat queue HTTP gate"
    else
        bad "AI Chat queue HTTP gate (see ${LOG}.q)"
    fi
else
    bad "scripts/e2e-ai-chat-queue.sh missing"
fi

hdr "7/8  AI App Builder HTTP gate (live)"
if [ -x "./scripts/e2e-ai-app-builder.sh" ]; then
    if BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}" bash ./scripts/e2e-ai-app-builder.sh >"${LOG}.aab" 2>&1; then
        ok "AI App Builder HTTP gate"
    else
        bad "AI App Builder HTTP gate (see ${LOG}.aab)"
    fi
else
    bad "scripts/e2e-ai-app-builder.sh missing"
fi

hdr "8/8  unit tests (RUN_TESTS=1 to enable)"
if [ "${RUN_TESTS:-0}" = "1" ]; then
    if timeout 600 pnpm -r --silent -F './apps/nestjs-backend' -F './packages/**' test-unit >"${LOG}.test" 2>&1; then
        ok "pnpm -r test-unit"
    else
        bad "pnpm -r test-unit (see ${LOG}.test)"
    fi
else
    echo "  ⏭️  skipped (set RUN_TESTS=1 to enable)"
fi

# ─── Summary ──────────────────────────────────────────────────────
printf '\n── Summary ─────────────────────────\n'
echo "  pass: $pass_count"
echo "  fail: $fail_count"

if [ "$fail_count" -gt 0 ]; then
    exit 1
fi
exit 0
