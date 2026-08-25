import { Injectable, Logger } from '@nestjs/common';
import { AutomationService } from './automation.service';

/**
 * Config shape stored on `automation_action.config` when `type='webhook'`.
 *
 *   {
 *     url:     string,    // HTTPS endpoint to POST
 *     method?: string,    // POST (default) | PUT
 *     headers?: object,   // extra headers to send (string→string map)
 *     secret?:  string,   // HMAC-SHA256 signing secret; if present, request
 *                         // body is signed and sent as `X-Teable-Signature`
 *     retryPolicy?: { maxRetries?: number }   // defaults to 3
 *   }
 */
export interface IWebhookActionConfig {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  secret?: string;
  retryPolicy?: { maxRetries?: number };
}

const RETRY_BACKOFF_MS = [1_000, 5_000, 30_000];

/**
 * Compute HMAC-SHA256 signature over `body` using `secret`, hex-encoded.
 * Exported for testability; the production caller goes through `signBody`.
 */
export const signBody = (body: string, secret: string): string => {
  // Node `crypto` is built-in — no new npm deps.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHmac } = require('crypto') as typeof import('crypto');
  return createHmac('sha256', secret).update(body).digest('hex');
};

/**
 * Dispatcher for `automation_action.type='webhook'`.
 *
 * Lifecycle:
 *   1. Caller invokes `dispatch({ runId, config, payload })`.
 *   2. We POST the JSON payload to `config.url` (PUT if specified).
 *   3. If `config.secret` is set, we sign the body with HMAC-SHA256 and
 *      send it as `X-Teable-Signature: sha256=<hex>`.
 *   4. On 2xx we call `automationService.finishRun(runId, succeeded)`.
 *   5. On non-2xx or network error we retry with exponential backoff
 *      (1s, 5s, 30s). After `maxRetries` exhausted, we mark the run as
 *      failed and persist the last error string.
 *
 * The dispatcher is intentionally synchronous (await chain) — it's meant
 * to run inside a BullMQ worker that yields control between runs. Concurrency
 * is regulated by the worker, not by the dispatcher.
 */
@Injectable()
export class WebhookDispatcher {
  private readonly logger = new Logger(WebhookDispatcher.name);

  constructor(private readonly automationService: AutomationService) {}

  /**
   * Public entry point. Returns the final run row (success or failure).
   */
  async dispatch(args: {
    runId: string;
    config: IWebhookActionConfig;
    payload: Record<string, unknown>;
  }): Promise<{ delivered: boolean; status?: number; error?: string }> {
    const { runId, config, payload } = args;
    if (!config?.url || !/^https?:\/\//.test(config.url)) {
      const error = `invalid webhook url: ${config?.url}`;
      await this.automationService.finishRun(runId, { status: 'failed', error });
      return { delivered: false, error };
    }
    const method = config.method ?? 'POST';
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(config.headers ?? {}),
    };
    if (config.secret) {
      headers['x-teable-signature'] = `sha256=${signBody(body, config.secret)}`;
    }
    const maxRetries = config.retryPolicy?.maxRetries ?? RETRY_BACKOFF_MS.length;
    let lastError: string | undefined;
    let lastStatus: number | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(config.url, { method, headers, body });
        lastStatus = res.status;
        if (res.ok) {
          await this.automationService.finishRun(runId, {
            status: 'succeeded',
            output: { delivered: true, status: res.status, attempt },
          });
          return { delivered: true, status: res.status };
        }
        lastError = `HTTP ${res.status}`;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
      if (attempt < maxRetries) {
        const waitMs = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)];
        this.logger.warn(
          `webhook ${runId} attempt ${attempt + 1}/${maxRetries + 1} failed (${lastError}); retrying in ${waitMs}ms`
        );
        await sleep(waitMs);
      }
    }
    await this.automationService.finishRun(runId, {
      status: 'failed',
      error: lastError ?? 'unknown error',
      output: lastStatus ? { delivered: false, status: lastStatus } : undefined,
    });
    return { delivered: false, status: lastStatus, error: lastError };
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
