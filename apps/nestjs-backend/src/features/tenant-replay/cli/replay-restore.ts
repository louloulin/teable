/* eslint-disable no-console */
/**
 * Tenant Replay — CLI restore entrypoint.
 *
 * Reads a JSON snapshot from disk and restores it into a fresh OSS
 * environment via TenantReplayService.replay.  Writes a JSON report to
 * the requested output path (default: <input>.report.json).
 *
 * Usage:
 *   tsx scripts/tenant-replay-restore.ts <in.json> [--out <report.json>]
 *   tsx scripts/tenant-replay-restore.ts <in.json> --rows 5 --no-anonymize
 *   tsx scripts/tenant-replay-restore.ts <in.json> --fail-fast
 *
 * All NestJS services are pulled via DI; the existing SpaceService /
 * BaseService / TableService / FieldOpenApiService / RecordOpenApiService
 * are invoked inside a CLS context shaped for a system "replay" user.
 */

import * as dotenv from 'dotenv-flow';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';

import { TenantReplayModule } from '../tenant-replay.module';
import { buildReplayClsStore, TenantReplayService } from '../tenant-replay.service';
import type {
  IReplayOptions,
  IReplayReport,
  ITenantSnapshot,
} from '../tenant-replay.types';

interface IRestoreArgs {
  inFile: string;
  outFile?: string;
  rowsPerTable?: number;
  anonymize?: 'none' | 'scrub';
  failFast?: boolean;
  noSchemaOps?: boolean;
  targetSpaceName?: string;
}

const parseArgs = (argv: string[]): IRestoreArgs => {
  const [, , inFile, ...rest] = argv;
  if (!inFile) {
    throw new Error(
      'Usage: tsx scripts/tenant-replay-restore.ts <in.json> [--out <report.json>] [--rows N] [--no-anonymize] [--fail-fast] [--no-schema-ops] [--target-space-name <name>]'
    );
  }
  const out: IRestoreArgs = { inFile };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    switch (flag) {
      case '--out':
        out.outFile = rest[++i];
        break;
      case '--rows':
        out.rowsPerTable = Number(rest[++i]);
        break;
      case '--no-anonymize':
        out.anonymize = 'none';
        break;
      case '--anonymize':
        out.anonymize = 'scrub';
        break;
      case '--fail-fast':
        out.failFast = true;
        break;
      case '--no-schema-ops':
        out.noSchemaOps = true;
        break;
      case '--target-space-name':
        out.targetSpaceName = rest[++i];
        break;
      default:
        if (flag.startsWith('-')) {
          throw new Error(`Unknown flag: ${flag}`);
        }
    }
  }
  return out;
};

/**
 * Public entrypoint — accepts an argv array so the top-level wrapper script
 * can forward `process.argv` without parsing twice.
 *
 * Exit codes:
 *   0 — replay succeeded
 *   1 — replay completed with errors (partial) or threw
 *   2 — bad CLI args
 */
export const runRestoreCli = async (argv: string[]): Promise<void> => {
  const args = parseArgs(argv);

  dotenv.config({ default_node_env: 'development' });

  const absIn = path.resolve(args.inFile);
  if (!fs.existsSync(absIn)) {
    throw new Error(`Snapshot not found: ${absIn}`);
  }

  const snapshot: ITenantSnapshot = JSON.parse(fs.readFileSync(absIn, 'utf8'));
  if (snapshot.version !== 1) {
    throw new Error(`Unsupported snapshot version: ${String(snapshot.version)} (expected 1)`);
  }

  const options: IReplayOptions = {
    rowsPerTable: args.rowsPerTable,
    anonymize: args.anonymize,
    failFast: args.failFast,
    runSchemaOperations: args.noSchemaOps ? false : true,
    targetSpaceName: args.targetSpaceName,
  };

  const app = await NestFactory.createApplicationContext(TenantReplayModule, {
    logger: ['error', 'warn', 'log'],
  });

  let report: IReplayReport;
  try {
    const replayService = app.get(TenantReplayService);
    const cls = app.get(ClsService);
    const store = buildReplayClsStore();
    report = await cls.runWith(store, () => replayService.replay(snapshot, options));
  } finally {
    await app.close();
  }

  const reportPath = path.resolve(args.outFile ?? `${absIn}.report.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        newSpaceId: report.newSpaceId,
        durationMs: report.durationMs,
        counts: report.counts,
        errors: report.errors.length,
        reportPath,
      },
      null,
      2
    )
  );

  if (!report.ok) {
    process.exit(1);
  }
};

// Allow `tsx` invocation: when this file is the script entry, run the CLI.
if (require.main === module) {
  runRestoreCli(process.argv).catch((e) => {
    console.error('replay-restore failed:', e);
    process.exit(1);
  });
}
