/* eslint-disable no-console */
/**
 * Top-level CLI entrypoint for tenant-replay CAPTURE.
 *
 * Thin wrapper around `src/features/tenant-replay/cli/replay-capture.ts`
 * that loads .env via `dotenv-flow` before the inner CLI reads any env
 * vars.  The inner CLI also loads .env, but doing it here too means the
 * script works even when run directly with `tsx` from any cwd.
 *
 * Usage:
 *   pnpm exec tsx apps/nestjs-backend/scripts/tenant-replay-capture.ts \
 *     <spaceId> <out.json> [--anonymize]
 *
 * Exit codes:
 *   0 — snapshot captured and written
 *   1 — capture failed (db / io / parse error)
 *   2 — bad CLI args
 */

import * as dotenv from 'dotenv-flow';
import * as path from 'node:path';

dotenv.config({
  path: path.resolve(__dirname, '../../../nextjs-app'),
  default_node_env: 'development',
});

import { runCaptureCli } from '../src/features/tenant-replay/cli/replay-capture';

runCaptureCli(process.argv).catch((err: unknown) => {
  console.error('tenant-replay-capture failed:', err);
  process.exit(1);
});
