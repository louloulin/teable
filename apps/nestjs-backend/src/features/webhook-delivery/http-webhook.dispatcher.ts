import { Injectable, Logger } from '@nestjs/common';

import { safeFetch } from '../../utils/ssrf-http';
import { DEFAULT_TIMEOUT_MS } from './webhook-delivery.types';
import type { IWebhookDispatcher, WebhookMethod } from './webhook-delivery.types';

/**
 * Production `IWebhookDispatcher` — POSTs/PUTs the webhook body via the
 * SSRF-guarded `safeFetch` (so operators can't point an endpoint at
 * `169.254.169.254` or the local metadata service).
 *
 * The dispatcher:
 *   - treats any network error as `statusCode=0`, which the state
 *     machine in `decideNextStatus()` flags as retriable;
 *   - never throws — webhook delivery should not break the dispatch
 *     loop, the auth service decides whether to retry or dead-letter.
 *
 * Kept deliberately small: headers + timeout are forwarded verbatim, so
 * the dispatcher works with whatever signing + retry policy the caller
 * has set on `IWebhookEndpoint`.
 */
@Injectable()
export class HttpWebhookDispatcher implements IWebhookDispatcher {
  private readonly logger = new Logger(HttpWebhookDispatcher.name);

  async send(args: {
    method: WebhookMethod;
    url: string;
    body: string;
    secret: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }): Promise<{ statusCode: number; body: string }> {
    const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await safeFetch(args.url, {
        method: args.method,
        body: args.body,
        headers: args.headers ?? {},
        signal: controller.signal,
      });
      const body = await res.text().catch(() => '');
      return { statusCode: res.status, body };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `webhook ${args.method} ${args.url} network error: ${msg}; reporting statusCode=0`
      );
      return { statusCode: 0, body: msg };
    } finally {
      clearTimeout(timer);
    }
  }
}
