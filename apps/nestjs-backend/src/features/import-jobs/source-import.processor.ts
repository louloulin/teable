/**
 * Source-import BullMQ worker.
 *
 * The processor is intentionally a thin lifecycle adapter. Per-source
 * logic (token resolution, cursor paging, batched Teable writes) lives
 * in each `SourceImportDriver`. The processor:
 *
 *   1. claims the durable lease via `SourceImportService.processTask`
 *   2. resolves the registered driver for the task's `source`
 *   3. delegates to `driver.runImport(...)` with cancel + progress hooks
 *   4. reconciles the final state via `markSucceeded` / `markFailed`
 *
 * Drivers are wired through the `SOURCE_IMPORT_DRIVER` multi-provider
 * token: adding a new driver is a single `useExisting` line in
 * `SourceImportModule`, no processor changes required.
 *
 * Cancel propagation: synchronous via `SourceImportCancellationService`
 * (in-memory set keyed by task id). The controller's cancel route and
 * the processor's catch path both flip the same set; drivers consult
 * the predicate between progress events without a DB read.
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Job } from 'bullmq';
import {
  SOURCE_IMPORT_JOB,
  SOURCE_IMPORT_QUEUE,
  SourceImportService,
  type ISourceImportJob,
} from './source-import.service';
import {
  SOURCE_IMPORT_DRIVER,
  type ISourceImportDriver,
  type ISourceImportRunInput,
} from './source-import.driver';
import { SourceImportCancellationService } from './source-import-cancellation.service';

const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const KNOWN_CANCEL_CODES: ReadonlySet<string> = new Set([
  'NOTION_IMPORT_CANCELED',
  'AIRTABLE_IMPORT_CANCELED',
  'GOOGLE_SHEETS_CANCELED',
]);

@Injectable()
@Processor(SOURCE_IMPORT_QUEUE, { concurrency: 2 })
export class SourceImportProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(SourceImportProcessor.name);
  private readonly drivers = new Map<string, ISourceImportDriver>();

  constructor(
    private readonly imports: SourceImportService,
    private readonly cancelSignal: SourceImportCancellationService,
    @Inject(SOURCE_IMPORT_DRIVER)
    private readonly registeredDrivers: ISourceImportDriver[],
    @InjectQueue(SOURCE_IMPORT_QUEUE) private readonly queue: Queue<ISourceImportJob>
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const recovered = await this.imports.recoverExpired();
    if (recovered > 0) {
      this.logger.log(`Recovered ${recovered} expired source-import leases on startup`);
    }
    this.drivers.clear();
    for (const driver of this.registeredDrivers) {
      if (!driver?.source) {
        this.logger.warn(`source-import driver missing 'source' field; skipping`);
        continue;
      }
      this.drivers.set(driver.source, driver);
    }
    if (this.drivers.size === 0) {
      this.logger.warn('No source-import drivers registered; all tasks will fail with NO_DRIVER');
    } else {
      this.logger.log(
        `Registered ${this.drivers.size} source-import driver(s): ${Array.from(
          this.drivers.keys()
        ).join(', ')}`
      );
    }
  }

  /** Manual registration hook (useful in tests where `onModuleInit` runs
   *  before `registeredDrivers` is populated). */
  registerDriver(driver: ISourceImportDriver): void {
    this.drivers.set(driver.source, driver);
  }

  async process(job: Job<ISourceImportJob>): Promise<unknown> {
    if (job.name !== SOURCE_IMPORT_JOB) {
      this.logger.warn(`Ignoring unknown source-import job: ${job.name}`);
      return null;
    }
    const taskId = job.data.taskId;
    const claimed = await this.imports.processTask(taskId);
    if (claimed.status === 'canceled' || claimed.status === 'succeeded' || claimed.status === 'failed') {
      return claimed;
    }
    const driver = this.drivers.get(claimed.source);
    if (!driver) {
      return this.imports.markFailed(taskId, {
        code: 'NO_DRIVER',
        message: `no driver registered for source: ${claimed.source}`,
        retryable: false,
      });
    }
    // Mirror a previously persisted cancel into memory on first miss so
    // worker restarts honor cancels written before this process started.
    await this.cancelSignal.absorbDbState(taskId);

    let lastSnapshot = { processedCount: 0, failedCount: 0, totalCount: 0 };
    const heartbeatTimer = setInterval(() => {
      void this.imports.updateProgress(taskId, lastSnapshot).catch(() => undefined);
    }, HEARTBEAT_INTERVAL_MS);
    const runInput: ISourceImportRunInput = {
      task: {
        id: claimed.id,
        spaceId: claimed.spaceId,
        baseId: claimed.baseId,
        tableId: claimed.tableId,
        remoteId: claimed.remoteId,
        payload: claimed.payload,
      },
      isCanceled: this.cancelSignal.predicate(taskId),
      onProgress: (counts) => {
        lastSnapshot = counts;
        return this.imports.updateProgress(taskId, counts);
      },
    };
    try {
      const result = await driver.runImport(runInput);
      return await this.imports.markSucceeded(taskId, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = (error as { code?: string } | null)?.code;
      const canceled =
        (code !== undefined && KNOWN_CANCEL_CODES.has(code)) ||
        this.cancelSignal.isCanceledSync(taskId) ||
        (await this.imports.isCanceled(taskId));
      clearInterval(heartbeatTimer);
      if (canceled) {
        return this.imports.getTask(taskId);
      }
      return this.imports.markFailed(taskId, {
        code: code ?? 'DRIVER_ERROR',
        message,
        retryable: !code || code === 'TRANSIENT_IMPORT_ERROR',
      });
    } finally {
      clearInterval(heartbeatTimer);
      this.cancelSignal.forget(taskId);
    }
  }
}
