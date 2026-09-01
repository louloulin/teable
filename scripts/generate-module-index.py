#!/usr/bin/env python3
"""
Generate unified `index.ts` for each feature module in apps/nestjs-backend/src/features/.

Each module is expected to export its public surface from a single `index.ts`
file (per AGENTS.md "module unification" rule). This script ensures that
file exists, deterministically. It is idempotent: re-running it produces
byte-identical output for the same module state.

What gets exported:
  - Module class (highest priority: {name}.module.ts)
  - Controller(s): *.{controller,controllers}.ts
  - Service(s): *.service.ts (excluding .spec.ts and .test.ts)
  - Guard(s): *.guard.ts
  - Constant exports (constants files, types files, schemas)
  - Type exports from types.ts / interfaces.ts
  - Public utility exports (utils.ts)

Skipped files:
  - *.spec.ts and *.test.ts (test files)
  - index.ts (the file we are generating)
  - *.module.ts is exported but not in the unified barrel for side-effect-free
    modules (it's already wired by NestJS)

The script walks the source AST naively using regex to detect top-level
`export class`, `export function`, `export const`, `export type`,
`export interface`, `export enum`, and `export { ... } from '...';`.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEATURES_DIR = ROOT / "apps/nestjs-backend/src/features"

EXPORT_FROM_RE = re.compile(r"^export\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?", re.MULTILINE)
EXPORT_CLASS_RE = re.compile(r"^export\s+(?:abstract\s+)?(?:default\s+)?class\s+(\w+)", re.MULTILINE)
EXPORT_FUNC_RE = re.compile(r"^export\s+(?:default\s+)?function\s+(\w+)", re.MULTILINE)
EXPORT_CONST_RE = re.compile(r"^export\s+const\s+(\w+)", re.MULTILINE)
EXPORT_TYPE_RE = re.compile(r"^export\s+(?:type|interface)\s+(\w+)", re.MULTILINE)
EXPORT_ENUM_RE = re.compile(r"^export\s+enum\s+(\w+)", re.MULTILINE)

# Files we never want to re-export (test files, the index itself)
SKIP_SUFFIXES = (".spec.ts", ".test.ts", ".d.ts")
SKIP_FILES = {"index.ts"}


def extract_local_exports(file_path: Path) -> list[str]:
    """Return the list of top-level export names declared in `file_path`."""
    try:
        text = file_path.read_text()
    except (FileNotFoundError, UnicodeDecodeError):
        return []
    # Strip block + line comments so `/* export class Foo */` does not
    # fool the regex below.
    text = re.sub(r"/\*[\s\S]*?\*/", "", text)
    text = re.sub(r"//[^\n]*", "", text)
    # Strip `export { ... } from '...';` (re-exports) and `export { ... };`
    # (re-exports of locally declared names). These are not declarations
    # of new symbols; we only want top-level `export class/function/const/
    # type/interface/enum` declarations.
    text = re.sub(r"^\s*export\s*\{[^}]*\}\s*(?:from\s*[\'\"][^\'\"]+[\'\"])?\s*;?\s*$",
                  "", text, flags=re.MULTILINE)
    names: list[str] = []
    for rx in (EX_REG := (
        EXPORT_CLASS_RE,
        EXPORT_FUNC_RE,
        EXPORT_CONST_RE,
        EXPORT_TYPE_RE,
        EXPORT_ENUM_RE,
    )):
        for m in rx.finditer(text):
            names.append(m.group(1))
    # Dedup while preserving order.
    seen = set()
    out: list[str] = []
    for n in names:
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out


def classify(file_path: Path) -> str:
    """Classify a file as 'module' / 'controller' / 'service' / 'guard' /
    'types' / 'util' / 'other'. Returns a category used in the index
    header comment."""
    name = file_path.name
    if name.endswith(".module.ts"):
        return "module"
    if "controller" in name:
        return "controller"
    if name.endswith(".service.ts"):
        return "service"
    if name.endswith(".guard.ts"):
        return "guard"
    if "type" in name or name == "types.ts" or name == "interfaces.ts":
        return "types"
    if name.endswith(".util.ts") or name == "utils.ts" or "/util/" in str(file_path):
        return "util"
    if name.endswith(".constants.ts") or name == "constants.ts":
        return "constants"
    return "other"


def generate_index(module_dir: Path | str) -> str:
    if isinstance(module_dir, str):
        module_dir = Path(module_dir)
    """Generate the index.ts content for the given module directory."""
    # Collect source files (skip tests, index.ts itself).
    src_files = sorted(
        f
        for f in module_dir.iterdir()
        if f.is_file()
        and f.suffix == ".ts"
        and f.name not in SKIP_FILES
        and not any(f.name.endswith(suf) for suf in SKIP_SUFFIXES)
    )
    # Bucket by category.
    buckets: dict[str, list[tuple[Path, list[str]]]] = {
        "module": [],
        "controller": [],
        "service": [],
        "guard": [],
        "types": [],
        "constants": [],
        "util": [],
        "other": [],
    }
    for f in src_files:
        cat = classify(f)
        buckets[cat].append((f, extract_local_exports(f)))

    module_name = module_dir.name

    lines: list[str] = []
    lines.append("/* AUTOGENERATED — DO NOT EDIT.")
    lines.append(" *")
    lines.append(f" * Unified public surface for `{module_name}` feature module.")
    lines.append(" *")
    lines.append(" * This file is regenerated by `scripts/generate-module-index.py`.")
    lines.append(" * To re-export a new public symbol, export it from one of the")
    lines.append(" * source files in this directory and re-run the script. Add")
    lines.append(" * manual re-exports below the generated block if needed.")
    lines.append(" */")

    has_any = False
    for cat, items in buckets.items():
        if not items:
            continue
        has_any = True
        if cat == "module":
            header = f"// ─── NestJS module ────────────────────────────────────────────────"
        elif cat == "controller":
            header = f"// ─── Controllers ──────────────────────────────────────────────────"
        elif cat == "service":
            header = f"// ─── Services ─────────────────────────────────────────────────────"
        elif cat == "guard":
            header = f"// ─── Guards ───────────────────────────────────────────────────────"
        elif cat == "types":
            header = f"// ─── Types / interfaces ───────────────────────────────────────────"
        elif cat == "constants":
            header = f"// ─── Constants ────────────────────────────────────────────────────"
        elif cat == "util":
            header = f"// ─── Utilities ────────────────────────────────────────────────────"
        else:
            header = f"// ─── Other public exports ─────────────────────────────────────────"
        lines.append("")
        lines.append(header)
        # Track symbols emitted in this run so we never duplicate across
        # files in the same directory (e.g. a type re-exported from a
        # sibling file should appear once, not twice).
        emitted: set[str] = set()
        for f, names in items:
            stem = f.stem
            if not names:
                # No top-level exports detected — emit star re-export,
                # but only if we have not already emitted one for this
                # file's stem (defensive).
                star_key = f"*{stem}"
                if star_key not in emitted:
                    lines.append(f"export * from './{stem}';")
                    emitted.add(star_key)
                continue
            # Group names from the same file into a single `export { a, b, c }`
            # statement to keep the barrel compact.
            new_names = [n for n in names if n not in emitted]
            if not new_names:
                continue
            lines.append(f"export {{ {', '.join(new_names)} }} from './{stem}';")
            for n in new_names:
                emitted.add(n)

    if not has_any:
        return None

    lines.append("")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    # CLI flags
    force = "--force" in argv
    if force:
        argv.remove("--force")
    dry = "--check" in argv
    if dry:
        argv.remove("--check")
    recursive = "--recursive" in argv
    if recursive:
        argv.remove("--recursive")
    only_missing = "--only-missing" in argv
    if only_missing:
        argv.remove("--only-missing")

    raw_targets = argv[1:] or [str(FEATURES_DIR)]
    # Expand: if a target is itself a directory containing feature modules,
    # walk its immediate subdirs. Allow both directory-paths-to-module and
    # directory-paths-to-parent-of-modules as input.
    targets: list[str] = []
    for t in raw_targets:
        target_path = Path(t)
        if not target_path.is_dir():
            continue
        if recursive:
            # Walk every nested directory that contains at least one source
            # file (post-skip). Guarantees 100% index.ts coverage across
            # helper subdirs (guard/, open-api/, utils/, plugins/, ...),
            # not only top-level feature modules.
            for d in sorted(target_path.rglob("*")):
                if not d.is_dir():
                    continue
                if d.name == "node_modules" or "/node_modules/" in str(d):
                    continue
                if any(
                    f.is_file()
                    and f.suffix == ".ts"
                    and f.name not in SKIP_FILES
                    and not any(f.name.endswith(suf) for suf in SKIP_SUFFIXES)
                    for f in d.iterdir()
                ):
                    targets.append(str(d))
            if str(target_path) not in targets:
                targets.append(str(target_path))
            continue
        # Heuristic: a "module dir" has *.module.ts or *.service.ts inside;
        # otherwise treat it as a parent of multiple modules.
        has_module = any(target_path.glob("*.module.ts"))
        if has_module:
            targets.append(str(target_path))
        else:
            for child in sorted(target_path.iterdir()):
                if child.is_dir():
                    targets.append(str(child))
    written = 0
    skipped = 0
    would_write = 0
    changed_files: list[str] = []
    for target in targets:
        module_dir = Path(target)
        if not module_dir.is_dir():
            continue
        index_path = module_dir / "index.ts"
        new_content = generate_index(module_dir)
        if new_content is None:
            # No source files (after skip). Don't create a stale empty
            # barrel — the directory contains only non-TS files (e.g.
            # .hbs / .mjs) or is a pure container. Skip entirely.
            continue
        existing = index_path.read_text() if index_path.exists() else None

        if existing is not None:
            if only_missing:
                skipped += 1
                continue
            if not force:
                skipped += 1
                continue
            if existing == new_content:
                skipped += 1
                continue
        if dry:
            print(f"would-write: {module_dir.relative_to(ROOT)}")
            would_write += 1
            continue
        index_path.write_text(new_content)
        written += 1
        changed_files.append(str(index_path.relative_to(ROOT)))

    if dry:
        print(f"generate-module-index: would_write {would_write}, skipped {skipped}")
    else:
        print(
            f"generate-module-index: wrote {written}, skipped {skipped} "
            f"(use --force to overwrite, --only-missing to skip existing)"
        )
        if changed_files:
            print("first 25 newly created/modified files:")
            for f in changed_files[:25]:
                print(f"  + {f}")
    return 0
if __name__ == "__main__":
    sys.exit(main(sys.argv))
