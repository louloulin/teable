import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Events } from '../../event-emitter/events';

// Cap on how long we'll wait for the audit listener before logging a timeout.
// The underlying promise isn't cancellable, but stopping tracking unblocks GC
// and surfaces slow writes as log lines.
const auditRecordTimeoutMs = 5000;

export interface IAuditLogRecord {
  method?: string;
  url?: string;
  controller?: string;
  handler?: string;
  callerId?: string | null;
  statusCode?: number;
  latencyMs?: number;
  // Catch-all for arbitrary HTTP audit metadata (headers/body redaction etc.).
  [key: string]: unknown;
}

/**
 * Fire-and-forget audit writer used by `AuditInterceptor` to record one
 * `http_request` event per controller call. Mirrors the public surface called
 * out in `brief.md` (`AuditLogService.record(eventType, payload)`) so the
 * interceptor's contract stays independent of `AuditScope.emitAtomic` (which
 * requires a `resourceId` and is shaped around domain events, not HTTP request
 * metadata).
 *
 * Internally this delegates to the same `Events.AUDIT_LOG_EMIT` channel that
 * `@Audit()` / `AuditScope` uses, so downstream listeners (and any future
 * `AuditLogListener.handleAuditLogEmit` writer) get a single, uniform stream
 * of audit rows. A separate `action` value (`'http_request'`) keeps the
 * payload distinguishable from explicit domain audit events.
 *
 * Audit failures MUST NOT propagate to the caller — observability never
 * breaks the hot path. Errors and timeouts are logged and swallowed.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Schedule an audit row to fire in the background. Returns synchronously;
   * the caller MUST NOT await this — the response has already gone out.
   *
   * `eventType` becomes the `action` field on the emitted audit event. The
   * payload is spread onto the event object verbatim, so any caller can pass
   * shape-specific fields (the interceptor passes method/url/controller/etc.).
   */
  record(eventType: string, payload: IAuditLogRecord): void {
    const event = {
      action: eventType,
      resourceId: 'http_request',
      ...payload,
    };

    const writePromise = this.eventEmitter.emitAsync(Events.AUDIT_LOG_EMIT, event);
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`audit record timed out after ${auditRecordTimeoutMs}ms`));
      }, auditRecordTimeoutMs);
      timeoutHandle.unref?.();
    });
    Promise.race([writePromise, timeoutPromise])
      .then(() => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      })
      .catch((err: unknown) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.logger.error(
          `audit record failed for action=${eventType}: ${(err as Error)?.message ?? err}`,
          (err as Error)?.stack
        );
      });
  }
}
