#!/usr/bin/env ts-node
/* eslint-disable no-console */
/**
 * Optional CLI helper that wraps the same scan the prebuild hook runs.
 *
 * Usage (from apps/nestjs-backend):
 *   pnpm ts-node ./test-helpers/enum-check.ts
 *
 * Exits 0 when every HttpErrorCode.<key> reference across apps/ and packages/
 * resolves to a defined enum key, exits 1 otherwise.
 */
import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';

const here = dirname(new URL(import.meta.url).pathname);
const cwd = resolve(here, '..');

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    '--reporter=verbose',
    '--root',
    '../..',
    '../../packages/core/src/errors/http/enum-guard.test.ts',
  ],
  {
    cwd,
    stdio: 'inherit',
    env: process.env,
  }
);

process.exit(result.status ?? 1);
