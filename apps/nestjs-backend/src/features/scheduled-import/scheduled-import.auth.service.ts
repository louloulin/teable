/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Scheduled import/export — NestJS auth service (Stage 88).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  appendJob,
  checkpoint,
  chunkCount,
  isFinished,
  planChunks,
  validateJob,
} from './scheduled-import.service';
import type {
  IImportCheckpoint,
  IImportJob,
} from './scheduled-import.types';

@Injectable()
export class ScheduledImportAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create or update a job. */
  async saveJob(input: { orgId: string; job: IImportJob }): Promise<IImportJob> {
    const err = validateJob(input.job);
    if (err) throw new Error(err);
    const id = `${input.orgId}:${input.job.id}`;
    await this.prisma.importJob.upsert({
      where: { id },
      create: {
        id,
        orgId: input.orgId,
        direction: input.job.direction,
        format: input.job.format,
        sourceUri: input.job.sourceUri,
        targetUri: input.job.targetUri,
        chunkSize: input.job.chunkSize,
        maxRows: input.job.maxRows,
        deadline: new Date(input.job.deadline),
        checkpoint: input.job.checkpoint ?? 0,
      },
      update: {
        direction: input.job.direction,
        format: input.job.format,
        sourceUri: input.job.sourceUri,
        targetUri: input.job.targetUri,
        chunkSize: input.job.chunkSize,
        maxRows: input.job.maxRows,
        deadline: new Date(input.job.deadline),
        checkpoint: input.job.checkpoint ?? 0,
      },
    });
    return input.job;
  }

  /** Load a stored job. */
  async loadJob(orgId: string, jobId: string): Promise<IImportJob | null> {
    const row = await this.prisma.importJob.findUnique({
      where: { id: `${orgId}:${jobId}` },
    });
    return row ? this.rowToJob(row) : null;
  }

  /** Plan the next chunks for a stored job. */
  async planJob(input: {
    orgId: string;
    jobId: string;
    totalRows: number;
  }): Promise<Array<{ start: number; end: number }>> {
    const job = await this.loadJob(input.orgId, input.jobId);
    if (!job) throw new Error(`job not found: ${input.jobId}`);
    return planChunks({ job, totalRows: input.totalRows });
  }

  /** Build a checkpoint after running some chunks. */
  async checkpointJob(input: {
    orgId: string;
    jobId: string;
    rowsProcessed: number;
    rowsFailed: number;
    chunks: number;
    now: number;
  }): Promise<IImportCheckpoint> {
    const job = await this.loadJob(input.orgId, input.jobId);
    if (!job) throw new Error(`job not found: ${input.jobId}`);
    const cp = checkpoint({
      job: { ...job, checkpoint: input.rowsProcessed },
      rowsProcessed: input.rowsProcessed,
      rowsFailed: input.rowsFailed,
      chunks: input.chunks,
      now: input.now,
    });
    await this.prisma.importJob.update({
      where: { id: `${input.orgId}:${input.jobId}` },
      data: { checkpoint: input.rowsProcessed },
    });
    return cp;
  }

  /** Whether the job is done. */
  async isFinished(input: { orgId: string; jobId: string; totalRows: number }): Promise<boolean> {
    const job = await this.loadJob(input.orgId, input.jobId);
    if (!job) throw new Error(`job not found: ${input.jobId}`);
    return isFinished({ job, totalRows: input.totalRows });
  }

  /** How many chunks would this job produce? */
  chunkCount = chunkCount;
  appendJob = appendJob;

  private rowToJob(r: Record<string, unknown>): IImportJob {
    return {
      id: String(r['id']).split(':').slice(1).join(':'),
      orgId: String(r['orgId']),
      direction: r['direction'] as IImportJob['direction'],
      format: r['format'] as IImportJob['format'],
      sourceUri: r['sourceUri'] ? String(r['sourceUri']) : undefined,
      targetUri: r['targetUri'] ? String(r['targetUri']) : undefined,
      chunkSize: Number(r['chunkSize']),
      maxRows: Number(r['maxRows']),
      deadline: new Date(r['deadline'] as string).toISOString(),
      checkpoint: Number(r['checkpoint']),
    };
  }
}
