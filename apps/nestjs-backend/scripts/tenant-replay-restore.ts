/* eslint-disable no-console */
/**
 * Top-level CLI entrypoint for tenant-replay RESTORE.
 *
 * Thin wrapper around `src/features/tenant-replay/cli/replay-restore.ts`
 * that loads .env before the inner CLI reads any env vars.
 *
 * Usage:
 *   pnpm exec tsx apps/nestjs-backend/scripts/tenant-replay-restore.ts \
 *     <in.json> [--out <report.json>] [--rows N] [--no-anonymize] [--fail-fast]
 *
 * Exit codes:
 *   0 — replay succeeded
 *   1 — replay completed with errors or threw
 *   2 — bad CLI args
 */

import * as dotenv from 'dotenv-flow';
import * as path from 'node:path';

dotenv.config({
  path: path.resolve(__dirname, '../../../nextjs-app'),
  default_node_env: 'development',
});

import { runRestoreCli } from '../src/features/tenant-replay/cli/replay-restore';

runRestoreCli(process.argv).catch((err: unknown) => {
  console.error('tenant-replay-restore failed:', err);
  process.exit(1);
});
