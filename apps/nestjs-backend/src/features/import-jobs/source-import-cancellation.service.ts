/**
 * Cross-process cancel signal for source-import tasks.
 *
 * The `SourceImportService` persists `cancelRequested=true` to the
 * durable row, but DB writes are async and drivers need a synchronous
 * way to abort between progress events. This service keeps an
 * in-memory set of canceled task IDs in the running process and lets
 * drivers consult it without a round-trip.
 *
 * On worker restart the in-memory set is empty; drivers fall through
 * to `SourceImportService.isCanceled` for a one-time DB read, after
 * which the durable cancel signal is mirrored back into memory.
 *
 * The controller (and any other code path that wants to cancel a
 * running task) calls `requestCancel(taskId)` after the DB row has
 * been updated; the in-memory set is the synchronous hot path.
 */
import { Injectable } from '@nestjs/common';
import { SourceImportService } from './source-import.service';

@Injectable()
export class SourceImportCancellationService {
  private readonly canceled = new Set<string>();

  constructor(private readonly imports: SourceImportService) {}

  /** Idempotent. Marks `taskId` canceled in-memory for the current
   *  process. The DB row is the source of truth — callers should
   *  also call `SourceImportService.cancelTask` to persist. */
  requestCancel(taskId: string): void {
    if (!taskId) return;
    this.canceled.add(taskId);
  }

  /** Synchronous predicate drivers can call between progress events. */
  isCanceledSync(taskId: string): boolean {
    return this.canceled.has(taskId);
  }

  /** Returns the in-memory set so the processor can install the same
   *  predicate across all drivers. */
  predicate(taskId: string): () => boolean {
    return () => this.canceled.has(taskId);
  }

  /** Clears the in-memory mark once a task's lifecycle is finalized
   *  (succeeded / failed / canceled), avoiding a leak across long-lived
   *  processes. */
  forget(taskId: string): void {
    this.canceled.delete(taskId);
  }

  /** Mirrors a previously persisted `cancelRequested=true` into memory.
   *  Called by the processor once per task on first miss so a worker
   *  restart still honors a cancel written before the worker came
   *  online. */
  async absorbDbState(taskId: string): Promise<boolean> {
    const flag = await this.imports.isCanceled(taskId);
    if (flag) this.canceled.add(taskId);
    return flag;
  }
}
