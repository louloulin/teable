import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { catchError, tap, throwError } from 'rxjs';
import type { IClsStore } from '../../types/cls';
import { AuditLogService, type IAuditLogRecord } from './audit-log.service';

// Header / body fields that MUST be replaced with `'[REDACTED]'` in the audit
// payload. Keeping the set explicit and minimal avoids accidental logging of
// credentials while staying free of third-party sensitive-field detectors.
const REDACTED = '[REDACTED]';
const SENSITIVE_HEADER_FIELDS = new Set(['authorization', 'cookie']);
const SENSITIVE_BODY_FIELDS = new Set(['password', 'secret', 'token']);

const SENSITIVE_FIELD_REDACTION_KEY = '__auditRedactedFields';

interface IRedactionResult {
  body: Record<string, unknown>;
  redactedFields: string[];
}

/**
 * Global APP_INTERCEPTOR that records one `http_request` audit row for every
 * controller call, side-by-side with the explicit `@Audit()` decorator.
 *
 * Behavior contract (see brief.md / spec.md):
 *
 *  - Logs `{ method, url, controller, handler, callerId, statusCode, latencyMs }`
 *    for every response — including 4xx / 5xx (the interceptor runs after
 *    guards; an UnauthorizedException from `AuthGuard` still flows through).
 *  - Redacts `authorization` / `cookie` headers and `password` / `secret` /
 *    `token` body fields to `'[REDACTED]'`. The full redaction list lives on
 *    the request under a sentinel key so downstream consumers (debug logs,
 *    the test) can introspect what was scrubbed.
 *  - Never awaits `AuditLogService.record()` — the response is returned first.
 *  - Never lets `AuditLogService.record()` throw — audit failures are logged
 *    by the service and must not propagate to the caller.
 *  - Returns the response (or rethrows) untouched.
 *
 * `instance` and `countRequestsSinceBoot()` exist so future health / e2E
 * checks can verify the interceptor is actually wired into the app without
 * having to inspect DI internals.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  static instance: AuditInterceptor | null = null;
  private count = 0;

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly cls: ClsService<IClsStore>
  ) {
    AuditInterceptor.instance = this;
  }

  countRequestsSinceBoot(): number {
    return this.count;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<
      Request & { [SENSITIVE_FIELD_REDACTION_KEY]?: string[] }
    >();
    const response = httpContext.getResponse<Response>();
    const startedAt = Date.now();

    const controllerClass = context.getClass();
    const handlerFn = context.getHandler();
    const method = request?.method;
    const url = request?.originalUrl ?? request?.url;

    const redaction = redactRequest(request);
    request[SENSITIVE_FIELD_REDACTION_KEY] = redaction.redactedFields;

    const callerId = (this.cls.get('user.id') as string | undefined) ?? null;

    return next.handle().pipe(
      tap({
        next: () =>
          this.emit({
            method,
            url,
            controller: controllerClass?.name,
            handler: handlerFn?.name,
            callerId,
            statusCode: response?.statusCode,
            latencyMs: Date.now() - startedAt,
            redactedFields: redaction.redactedFields,
            body: redaction.body,
          }),
        error: (err: unknown) =>
          this.emit({
            method,
            url,
            controller: controllerClass?.name,
            handler: handlerFn?.name,
            callerId,
            statusCode: response?.statusCode,
            latencyMs: Date.now() - startedAt,
            redactedFields: redaction.redactedFields,
            body: redaction.body,
            errorName: (err as { name?: string } | undefined)?.name,
          }),
      }),
      catchError((err: unknown) => {
        // Preserve the original error chain — `tap({ error })` is for side
        // effects only. Audit failures have already been swallowed by the
        // service in `this.emit`; nothing else to do here.
        return throwError(() => err);
      })
    );
  }

  private emit(payload: IAuditLogRecord): void {
    this.count += 1;
    try {
      this.auditLogService.record('http_request', payload);
    } catch (err) {
      // Defense in depth — the service is supposed to swallow errors, but if
      // something unexpected escapes we still must not break the request.
      console.error('AuditInterceptor failed:', err);
    }
  }
}

function redactRequest(request: Request | undefined): IRedactionResult {
  const redactedFields: string[] = [];
  const safeBody: Record<string, unknown> = {};

  if (!request) {
    return { body: safeBody, redactedFields };
  }

  const headers = (request.headers ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_FIELDS.has(key.toLowerCase())) {
      redactedFields.push(`headers.${key}`);
      // Don't include the value at all — record the marker so test assertions
      // can confirm the key was scrubbed without leaking bytes.
      safeBody[`headers.${key}`] = REDACTED;
    }
  }

  const body = (request as { body?: unknown }).body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (SENSITIVE_BODY_FIELDS.has(key.toLowerCase())) {
        redactedFields.push(`body.${key}`);
        safeBody[`body.${key}`] = REDACTED;
      }
    }
  }

  return { body: safeBody, redactedFields };
}
