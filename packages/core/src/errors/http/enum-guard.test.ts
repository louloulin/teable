/* eslint-disable regexp/prefer-w, @typescript-eslint/no-unused-vars */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

import { describe, expect, it } from 'vitest';

import { HttpErrorCode } from './http-response.types';

/**
 * Build-time static validation that every HttpErrorCode dot reference
 * in apps/ and packages/ resolves to a key actually defined in
 * `http-response.types.ts`.
 *
 * Any string-index access that bypasses TypeScript's type checking
 * (e.g. referencing a key that is not a defined enum member) silently
 * evaluates to `undefined` at runtime, which surfaces as
 * `RangeError: Invalid status code: undefined`.
 *
 * This test runs in the `prebuild` chain of `apps/nestjs-backend`, so a
 * missing enum key fails the build before tsc/webpack can produce dist.
 */

const HTTPE_REF_REGEX = /\bHttpErrorCode\.([A-Za-z_][A-Za-z0-9_]*)/g;

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.git',
  'coverage',
  'out',
  'build',
  '.worktrees',
  'static', // static assets live here, no .ts source
]);

function findRepoRoot(start: string): string {
  // Walk up from the test file until we find a directory that has both
  // `apps/` and `packages/` next to it.
  let cur = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(cur, 'apps')) && existsSync(join(cur, 'packages'))) {
      return cur;
    }
    const parent = resolve(cur, '..');
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error(
    `[enum-guard] Could not locate repo root from ${start} (expected apps/ + packages/ siblings)`
  );
}

function listTsFiles(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        stack.push(full);
      } else if (s.isFile()) {
        // Match by lowercase suffix without locale tricks; .ts / .cts / .mts only.
        const lower = entry.toLowerCase();
        if (lower.endsWith('.ts')) {
          out.push(full);
        }
      }
    }
  }
  return out;
}

describe('HttpErrorCode enum guard', () => {
  it('all HttpErrorCode.* references resolve to a defined enum key', () => {
    const repoRoot = findRepoRoot(__dirname);
    const files = listTsFiles(repoRoot);

    // Capture every HttpErrorCode dot-key occurrence across the repo.
    const violations = new Map<string, Set<string>>();
    let totalRefs = 0;

    for (const file of files) {
      let content: string;
      try {
        content = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      // Reset regex state per file.
      HTTPE_REF_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = HTTPE_REF_REGEX.exec(content)) !== null) {
        const key = match[1];
        totalRefs++;
        if ((HttpErrorCode as unknown as Record<string, string | undefined>)[key] === undefined) {
          let bucket = violations.get(key);
          if (!bucket) {
            bucket = new Set();
            violations.set(key, bucket);
          }
          bucket.add(file);
        }
      }
    }

    if (violations.size > 0) {
      const lines: string[] = [];
      lines.push(
        `[enum-guard] ${violations.size} undefined HttpErrorCode key(s) across ${files.length} scanned file(s):`
      );
      const sortedKeys = Array.from(violations.keys()).sort();
      for (const key of sortedKeys) {
        const filesForKey = Array.from(violations.get(key)!).sort();
        lines.push(
          `  - HttpErrorCode.${key} not defined in packages/core/src/errors/http/http-response.types.ts (used in ${filesForKey.length} file(s))`
        );
        for (const f of filesForKey.slice(0, 5)) {
          lines.push(`      ${f}`);
        }
        if (filesForKey.length > 5) {
          lines.push(`      ... and ${filesForKey.length - 5} more`);
        }
      }
      lines.push(
        `[enum-guard] Scanned ${files.length} .ts file(s); ${totalRefs} HttpErrorCode.* reference(s); ${violations.size} broken.`
      );
      throw new Error(lines.join('\n'));
    }

    // Sanity log for visibility when things are healthy.
    // eslint-disable-next-line no-console
    console.log(
      `[enum-guard] OK: scanned ${files.length} .ts file(s); ${totalRefs} HttpErrorCode.* reference(s) all resolve.`
    );
    expect(violations.size).toBe(0);
  });
});
