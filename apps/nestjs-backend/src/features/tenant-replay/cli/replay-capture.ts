/* eslint-disable no-console */
/**
 * Tenant Replay — CLI capture entrypoint.
 *
 * Boots a Nest application with TenantReplayModule, calls
 * TenantSnapshotService.captureSnapshot, and writes the JSON snapshot to
 * the requested output path.
 *
 * Usage:
 *   tsx scripts/tenant-replay-capture.ts <spaceId> <out.json>
 *   tsx scripts/tenant-replay-capture.ts <spaceId> <out.json> --anonymize
 *
 * The CLI sets NODE_ENV=development and loads .env via the standard
 * backend bootstrap (no listener port is opened — we only resolve the DI
 * graph).
 */

import * as dotenv from 'dotenv-flow';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NestFactory } from '@nestjs/core';

import { TenantReplayModule } from '../tenant-replay.module';
import { TenantSnapshotService } from '../tenant-snapshot.service';
import { type IAnonymizePolicy, type ITenantSnapshot } from '../tenant-replay.types';
import { anonymizeSnapshot } from '../tenant-anonymize.util';

/**
 * Public entrypoint — accepts an argv array so the top-level wrapper script
 * can forward `process.argv` without parsing twice.
 *
 * Exit codes:
 *   0 — snapshot captured and written
 *   1 — capture failed (db / io / parse error)
 *   2 — bad CLI args
 */
export const runCaptureCli = async (argv: string[]): Promise<void> => {
  const [, , spaceIdArg, outFileArg, ...rest] = argv;

  if (!spaceIdArg || !outFileArg) {
    console.error(
      'Usage: tsx scripts/tenant-replay-capture.ts <spaceId> <out.json> [--anonymize]'
    );
    process.exit(2);
  }

  const anonymizePolicy: IAnonymizePolicy = rest.includes('--anonymize') ? 'scrub' : 'none';

  dotenv.config({ default_node_env: 'development' });

  const app = await NestFactory.createApplicationContext(TenantReplayModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const service = app.get(TenantSnapshotService);
    let snapshot: ITenantSnapshot = await service.captureSnapshot(spaceIdArg);
    if (anonymizePolicy === 'scrub') {
      snapshot = anonymizeSnapshot(snapshot);
    }

    const absOut = path.resolve(outFileArg);
    fs.mkdirSync(path.dirname(absOut), { recursive: true });
    fs.writeFileSync(absOut, JSON.stringify(snapshot, null, 2));

    console.log(
      JSON.stringify(
        {
          ok: true,
          sourceSpaceId: snapshot.sourceSpaceId,
          capturedAt: snapshot.capturedAt,
          anonymized: snapshot.anonymized,
          summary: snapshot.summary,
          out: absOut,
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
  }
};

// Allow `tsx` invocation: when this file is the script entry, run the CLI.
if (require.main === module) {
  runCaptureCli(process.argv).catch((e) => {
    console.error('replay-capture failed:', e);
    process.exit(1);
  });
}
