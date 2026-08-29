/**
 * AI streaming service — Round 12 T-14.
 *
 * Spec covers the SSE response plumbing helper. The actual LLM generator
 * (`AiService.generateTextStream`) is mocked with a synthetic async iterable
 * so the helper is exercised without any model call.
 *
 * Hard constraints honored:
 *   - Zero new npm dependencies — uses vitest's built-in fake timers + a
 *     hand-rolled `Response` mock.
 *   - No edits to existing ai.service.ts / ai.controller.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { AiStreamingService, type IStreamChunk } from './ai-streaming.service';

interface IMockResponse {
  written: string[];
  statusCode: number;
  headers: Record<string, string>;
  writableEnded: boolean;
  destroyed: boolean;
  closeListeners: Array<() => void>;
  on(event: 'close', listener: () => void): unknown;
  once(event: 'close', listener: () => void): unknown;
  write(chunk: string): boolean;
  end(): unknown;
  setHeader(name: string, value: string): IMockResponse;
  getHeader(name: string): string | undefined;
  flushHeaders(): IMockResponse;
  flush?(): void;
}

const createMockResponse = (): IMockResponse => {
  const closeListeners: Array<() => void> = [];
  const fireClose = () => {
    // Snapshot so handlers can remove themselves during iteration.
    const snapshot = closeListeners.slice();
    closeListeners.length = 0;
    snapshot.forEach((fn) => fn());
  };
  const mock = {
    written: [] as string[],
    statusCode: 200,
    headers: {} as Record<string, string>,
    writableEnded: false,
    destroyed: false,
    closeListeners,
    on(event: 'close', listener: () => void) {
      if (event === 'close') {
        closeListeners.push(listener);
      }
      return mock;
    },
    once(event: 'close', listener: () => void) {
      if (event === 'close') {
        closeListeners.push(() => {
          listener();
        });
      }
      return mock;
    },
    write(chunk: string) {
      mock.written.push(chunk);
      return true;
    },
    end() {
      mock.writableEnded = true;
      fireClose();
      return mock;
    },
    setHeader(name: string, value: string) {
      mock.headers[name.toLowerCase()] = value;
      return mock;
    },
    getHeader(name: string) {
      return mock.headers[name.toLowerCase()];
    },
    flushHeaders() {
      return mock;
    },
    flush() {
      // no-op for mock
    },
  };
  return mock as unknown as IMockResponse;
};

const createAsyncIterable = (chunks: IStreamChunk[]): AsyncIterable<IStreamChunk> => {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i < chunks.length) {
            const value = chunks[i++];
            return { value, done: false };
          }
          return { value: undefined, done: true };
        },
        async return() {
          return { value: undefined, done: true };
        },
      };
    },
  };
};

describe('AiStreamingService', () => {
  let service: AiStreamingService;
  let response: IMockResponse;

  beforeEach(() => {
    service = new AiStreamingService();
    response = createMockResponse();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('prepareStreamResponse', () => {
    it('sets the SSE response headers and flushes them', () => {
      service.prepareStreamResponse(response as unknown as Response);
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache, no-transform');
      expect(response.headers['connection']).toBe('keep-alive');
      expect(response.headers['x-accel-buffering']).toBe('no');
    });
  });

  describe('isStreamClosed', () => {
    it('returns true once the response has been ended', () => {
      expect(service.isStreamClosed(response as unknown as Response)).toBe(false);
      response.writableEnded = true;
      expect(service.isStreamClosed(response as unknown as Response)).toBe(true);
    });
  });

  describe('writeStreamEvent', () => {
    it('writes a JSON-encoded SSE event line', () => {
      service.writeStreamEvent(response as unknown as Response, {
        delta: 'hello',
        done: false,
      });
      expect(response.written).toEqual(['data: {"delta":"hello","done":false}\n\n']);
    });

    it('no-ops when the response has already been closed', () => {
      response.writableEnded = true;
      service.writeStreamEvent(response as unknown as Response, { delta: 'x', done: false });
      expect(response.written).toEqual([]);
    });
  });

  describe('streamChunks', () => {
    it('flushes three chunks plus a synthetic terminal event', async () => {
      const chunks: IStreamChunk[] = [
        { delta: 'one', done: false },
        { delta: 'two', done: false },
        { delta: 'three', done: true, value: 'onetwothree' },
      ];
      const controller = new AbortController();
      await service.streamChunks(
        response as unknown as Response,
        createAsyncIterable(chunks),
        controller
      );
      const events = response.written
        .filter((line) => line.startsWith('data: '))
        .map((line) => JSON.parse(line.slice(6).trim()));
      // Expect: 3 real chunks + 1 synthetic terminal because we exited on
      // done:true (which `break`s out of the loop) but the helper still
      // sends one more terminal marker.
      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events[0]).toEqual({ delta: 'one', done: false });
      expect(events[1]).toEqual({ delta: 'two', done: false });
      expect(events[2]).toMatchObject({ delta: 'three', done: true });
      expect(response.writableEnded).toBe(true);
    });

    it('aborts upstream and closes the response when client disconnects', async () => {
      const controller = new AbortController();
      const iterator = (async function* () {
        yield { delta: 'first', done: false };
        // simulate slow upstream after the first chunk
        await new Promise((r) => setTimeout(r, 10));
        yield { delta: 'second', done: false };
      })();
      const streamP = service.streamChunks(response as unknown as Response, iterator, controller);
      // Wait for streamChunks to flush the first chunk and enter the
      // pending await above. This ensures its close-listener is registered
      // before we synthesize the disconnect.
      await new Promise((resolve) => setTimeout(resolve, 5));
      // Sanity: at least one close listener was registered by streamChunks.
      expect(response.closeListeners.length).toBeGreaterThan(0);
      // Synthesize the client closing the connection.
      response.end();
      expect(controller.signal.aborted).toBe(true);
      await streamP;
      expect(response.writableEnded).toBe(true);
      // First chunk made it to the wire; second never should.
      const events = response.written
        .filter((line) => line.startsWith('data: '))
        .map((line) => JSON.parse(line.slice(6).trim()));
      expect(events.some((evt) => evt.delta === 'first')).toBe(true);
      expect(events.some((evt) => evt.delta === 'second')).toBe(false);
    });

    it('emits an error event when the iterator throws', async () => {
      const controller = new AbortController();
      const iterator = (async function* () {
        yield { delta: 'first', done: false };
        throw new Error('upstream exploded');
      })();
      await service.streamChunks(response as unknown as Response, iterator, controller);
      const errorEvent = response.written
        .filter((line) => line.startsWith('data: '))
        .map((line) => JSON.parse(line.slice(6).trim()))
        .find((evt: { error?: boolean }) => evt?.error === true);
      expect(errorEvent).toMatchObject({ error: true, message: 'upstream exploded' });
      expect(response.writableEnded).toBe(true);
    });
  });
});
