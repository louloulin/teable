/**
 * AI field streaming — Round 12 T-14.
 *
 * Server-Sent Events helper for token-by-token AI field generation. The actual
 * LLM call is made by `AiService.generateTextStream` (added in this same
 * change) which yields `{delta, done, value?}` chunks. This service owns the
 * response plumbing: headers, heartbeat, abort handling, and the final flush.
 *
 * Hard constraints honored:
 *   - Zero new npm dependencies — uses Express `Response` directly.
 *   - Existing `ai.service.ts` core handlers are untouched; we add one new
 *     method (`generateTextStream`) and this helper sits beside it.
 *   - No edits to `ai.controller.ts` — the SSE surface lives in a new
 *     controller (`ai-streaming.controller.ts`).
 */
import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';

export interface IStreamChunk {
  /** Incremental text produced for this chunk. Empty on the final flush. */
  delta: string;
  /** True when the iterator has completed and `value` is the full text. */
  done: boolean;
  /** Full accumulated text — present on the final `{done: true}` chunk. */
  value?: string;
}

export interface IStreamErrorChunk {
  /** True when this chunk carries an error payload instead of a delta. */
  error: true;
  message: string;
}

export type IAiStreamEvent = IStreamChunk | IStreamErrorChunk;

const HEARTBEAT_INTERVAL_MS = 15_000;
const SSE_DATA_PREFIX = 'data: ';
const SSE_LINE_BREAK = '\n\n';

@Injectable()
export class AiStreamingService {
  private readonly logger = new Logger(AiStreamingService.name);

  /**
   * Apply the SSE response headers and flush so intermediaries (nginx, etc.)
   * do not buffer the chunks. Mirrors the trash-restore field pattern so the
   * two stream surfaces behave consistently across the app.
   */
  prepareStreamResponse(response: Response): void {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();
  }

  /** Best-effort check used inside the loop to bail when the client left. */
  isStreamClosed(response: Response): boolean {
    return Boolean(response.writableEnded || response.destroyed);
  }

  /** Write a single `{delta, done}` event to the response. */
  writeStreamEvent(response: Response, payload: IAiStreamEvent): void {
    if (this.isStreamClosed(response)) {
      return;
    }
    try {
      response.write(`${SSE_DATA_PREFIX}${JSON.stringify(payload)}${SSE_LINE_BREAK}`);
      (response as Response & { flush?: () => void }).flush?.();
    } catch (error) {
      this.logger.warn(`writeStreamEvent failed: ${(error as Error)?.message ?? error}`);
    }
  }

  /**
   * Start a 15-second heartbeat so reverse proxies do not drop idle SSE
   * connections during slow first-token latency on large prompts.
   */
  startHeartbeat(response: Response): NodeJS.Timeout {
    const heartbeat = setInterval(() => {
      if (this.isStreamClosed(response)) {
        return;
      }
      try {
        response.write(': ping\n\n');
        (response as Response & { flush?: () => void }).flush?.();
      } catch {
        clearInterval(heartbeat);
      }
    }, HEARTBEAT_INTERVAL_MS);
    response.on('close', () => clearInterval(heartbeat));
    return heartbeat;
  }

  /**
   * Drain an `AsyncIterable<IStreamChunk>` into SSE events. Stops iterating
   * the moment `signal.aborted` fires (cancels the upstream LLM call) or the
   * response is closed by the client. Errors surface as a final error event
   * so the frontend can render a graceful fallback.
   */
  async streamChunks(
    response: Response,
    chunks: AsyncIterable<IStreamChunk>,
    signal: AbortSignal
  ): Promise<void> {
    const heartbeat = this.startHeartbeat(response);
    const stopOnClose = () => {
      try {
        signal.abort();
      } catch {
        // signal may already be aborted; ignore.
      }
    };
    response.once('close', stopOnClose);

    try {
      for await (const chunk of chunks) {
        if (signal.aborted || this.isStreamClosed(response)) {
          break;
        }
        this.writeStreamEvent(response, chunk);
        if (chunk.done) {
          break;
        }
      }
      if (!signal.aborted && !this.isStreamClosed(response)) {
        // Send a synthetic terminal event so clients that exited the loop on
        // `{done: true}` still see a clear end-of-stream marker.
        this.writeStreamEvent(response, { delta: '', done: true });
      }
    } catch (error) {
      this.logger.warn(`streamChunks failed: ${(error as Error)?.message ?? error}`);
      this.writeStreamEvent(response, {
        error: true,
        message: (error as Error)?.message ?? 'stream failed',
      });
    } finally {
      clearInterval(heartbeat);
      try {
        response.end();
      } catch {
        // already closed
      }
    }
  }
}
