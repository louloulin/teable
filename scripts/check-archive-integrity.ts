/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-console */
/**
 * Wave 5 archive integrity check (G2-010).
 *
 * Verifies that every prior G2 change's archive directory under
 * docs/comet/archive/ contains the three required artifacts:
 *   - brief.md
 *   - comet-state.yaml
 *   - verification.md
 *
 * Also verifies each spec directory under docs/comet/specs/ has at
 * least one 00-*.md file.
 *
 * Pure stdlib, no npm deps. Run via:
 *   pnpm exec tsx scripts/check-archive-integrity.ts
 *
 * Exit code:
 *   0 — every archive ok
 *   1 — at least one archive missing a required file
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const ARCHIVE_DIR = join(REPO_ROOT, 'docs/comet/archive');
const SPEC_DIR = join(REPO_ROOT, 'docs/comet/specs');

const REQUIRED_FILES = ['brief.md', 'comet-state.yaml', 'verification.md'] as const;

interface ICheckResult {
  name: string;
  ok: boolean;
  missing: ReadonlyArray<string>;
}

function listG2Archives(): ReadonlyArray<string> {
  if (!existsSync(ARCHIVE_DIR)) return [];
  return readdirSync(ARCHIVE_DIR)
    .filter((name) => /^2026-08-26-g2-\d{3}-/.test(name))
    .sort();
}

function listG2Specs(): ReadonlyArray<string> {
  if (!existsSync(SPEC_DIR)) return [];
  return readdirSync(SPEC_DIR)
    .filter((name) => /^g2-\d{3}-/.test(name))
    .sort();
}

function checkArchive(name: string): ICheckResult {
  const archivePath = join(ARCHIVE_DIR, name);
  const missing = REQUIRED_FILES.filter(
    (file) => !existsSync(join(archivePath, file))
  );
  return { name, ok: missing.length === 0, missing };
}

function checkSpec(name: string): ICheckResult {
  const specPath = join(SPEC_DIR, name);
  let hasSpec = false;
  if (existsSync(specPath)) {
    const entries = readdirSync(specPath);
    // Specs may be named `00-*.md` (Wave 1..4 style) or `spec.md` (Wave 5
    // and some Round 26 carryovers). Accept either.
    hasSpec = entries.some(
      (entry) => /^00-.*\.md$/.test(entry) || /^spec\.md$/.test(entry)
    );
  }
  return hasSpec
    ? { name, ok: true, missing: [] }
    : { name, ok: false, missing: ['00-*.md or spec.md'] };
}

function main(): void {
  const archives = listG2Archives();
  const specs = listG2Specs();

  const results: ReadonlyArray<ICheckResult> = [
    ...archives.map(checkArchive),
    ...specs.map(checkSpec),
  ];

  let okCount = 0;
  let badCount = 0;
  for (const r of results) {
    if (r.ok) {
      okCount += 1;
      console.log(`[ok] ${r.name}`);
    } else {
      badCount += 1;
      console.log(`[missing] ${r.name} <${r.missing.join(',')}>`);
    }
  }

  console.log('');
  console.log(`summary: ${okCount} ok, ${badCount} missing, ${results.length} total`);

  if (badCount > 0) {
    process.exit(1);
  }
}

main();