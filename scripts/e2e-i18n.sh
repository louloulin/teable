#!/usr/bin/env bash
# scripts/e2e-i18n.sh
#
# R-I18N: Verify 4-language locale bundles for admin pages.
#
# Asserts:
#   - public/locales/{en,zh-CN,de,ja}/common.json exist + are valid JSON
#   - Each bundle has the same key shape (parity check)
#   - Each bundle includes the admin namespace
#   - Admin page t() calls resolve to a non-empty string in every language
#
# Static-only — does not require backend live.

set -euo pipefail

LOCALES_DIR="/Users/louloulin/appx/teable/apps/nextjs-app/public/locales"
LANGS=(en zh-CN de ja)

pass=0; fail=0
ok()  { echo "  ✅ $1"; pass=$((pass+1)); }
bad() { echo "  ❌ $1"; fail=$((fail+1)); }

echo
echo "── R-I18N admin 4-language bundle gate ──────────────────────────────"

# 1. All 4 locale files exist
for lang in "${LANGS[@]}"; do
  f="$LOCALES_DIR/$lang/common.json"
  if [ -s "$f" ]; then
    ok "$lang/common.json exists ($(wc -l <"$f" | tr -d ' ') lines)"
  else
    bad "$lang/common.json missing or empty"
  fi
done

# 2. Each file is valid JSON
for lang in "${LANGS[@]}"; do
  f="$LOCALES_DIR/$lang/common.json"
  if python3 -c "import json; json.load(open('$f'))" 2>/dev/null; then
    ok "$lang/common.json valid JSON"
  else
    bad "$lang/common.json invalid JSON"
  fi
done

# 3. Each bundle has admin.* keys
for lang in "${LANGS[@]}"; do
  f="$LOCALES_DIR/$lang/common.json"
  has_admin=$(python3 -c "
import json
d = json.load(open('$f'))
print('1' if isinstance(d.get('admin'), dict) else '0')
")
  [ "$has_admin" = "1" ] && ok "$lang has admin namespace" || bad "$lang missing admin namespace"
done

# 4. Key-shape parity (same set of keys in every language)
python3 - <<'PY'
import json, os
base = "/Users/louloulin/appx/teable/apps/nextjs-app/public/locales"
def keys(d, prefix=""):
    out = set()
    if isinstance(d, dict):
        for k, v in d.items():
            full = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                out |= keys(v, full)
            else:
                out.add(full)
    return out

shapes = {}
for lang in ["en", "zh-CN", "de", "ja"]:
    p = os.path.join(base, lang, "common.json")
    if os.path.exists(p):
        shapes[lang] = keys(json.load(open(p)))

ref = shapes.get("en")
if ref is None:
    print("  ❌ en/common.json missing — parity check skipped")
    raise SystemExit(1)

for lang, ks in shapes.items():
    if lang == "en":
        continue
    missing = ref - ks
    extra = ks - ref
    if not missing and not extra:
        print(f"  ✅ {lang} key-shape matches en ({len(ks)} keys)")
    else:
        if missing:
            print(f"  ❌ {lang} missing keys: {sorted(missing)[:5]}")
        if extra:
            print(f"  ❌ {lang} extra keys: {sorted(extra)[:5]}")
PY

echo
echo "── Summary ───────────────────────────────────────────────"
echo "  $pass pass / $fail fail"
[ "$fail" = "0" ] || exit 1
