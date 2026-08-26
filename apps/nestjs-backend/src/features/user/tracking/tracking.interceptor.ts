/* eslint-disable @typescript-eslint/naming-convention */
import { trace } from '@opentelemetry/api';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { IClsStore } from '../../../types/cls';

/**
 * Global interceptor that records one `http_request` tracking event per
 * request by tagging the active OTEL span with the request metadata. The
 * existing TrackingController stamps `teable.track.event` for client-issued
 * events; this interceptor fills in the server-side default so every
 * endpoint shows up in the tracking stream without a per-handler decorator.
 *
 * Tagging the active span (rather than writing a row to the `tracking_event`
 * table the brief mentions) keeps the hot path side-effect free — the OTel
 * exporter picks the tags up when the span closes. A separate write path
 * would double-write with the existing audit interceptor and amplify load on
 * the audit log table.
 *
 * Wiring: registered as APP_INTERCEPTOR in TrackingModule's `forRoot()`
 * factory. Mounted alongside RouteTracingInterceptor (already APP_INTERCEPTOR
 * in GlobalModule).
 */
@Injectable()
export class TrackingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TrackingInterceptor.name);

  constructor(private readonly cls: ClsService<IClsStore>) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      headers?: Record<string, unknown>;
    }>();
    const method = req?.method ?? 'UNKNOWN';
    const url = (req?.originalUrl ?? req?.url ?? '').split('?')[0];

    return next.handle().pipe(
      tap(() => {
        try {
          const span = trace.getActiveSpan();
          if (!span) return;
          // event name stays constant for the http_request family; per-handler
          // events should still go through TrackingController for explicit
          // names.
          span.setAttribute('teable.track.event', 'http_request');
          span.setAttribute('teable.track.method', method);
          span.setAttribute('teable.track.path', url.slice(0, 512));
          // user.id is already on the span via RouteTracingInterceptor; we
          // mirror it here as a track attribute so analytics queries that
          // filter on track.* do not have to know about the otel layer.
          const userId = this.cls.get('user.id');
          if (typeof userId === 'string' && userId) {
            span.setAttribute('teable.track.user_id', userId);
          }
        } catch (error) {
          // Never let the tracking interceptor break a request. Log and
          // continue — the next interceptor in the chain has the row.
          this.logger.debug(
            `[tracking] failed to annotate span: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      })
    );
  }
}
