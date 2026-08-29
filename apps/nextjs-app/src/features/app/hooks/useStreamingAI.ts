/**
 * useStreamingAI — Round 12 T-14.
 *
 * Hook that opens an SSE connection to `GET /api/:baseId/ai/stream/:fieldId`
 * and accumulates token deltas into `value`. Uses `fetch` + a body reader
 * (NOT EventSource) so the consumer can abort mid-stream via an
 * `AbortController`. The controller exposes `start`, `abort`, and a
 * derived `done` flag.
 *
 * Hard constraints honored:
 *   - Zero new npm dependencies — uses the browser-native `fetch` + `TextDecoder`.
 *   - The hook is feature-agnostic; the consumer wires the result into the
 *     grid cell or any other surface that wants the streaming output.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface IUseStreamingAIArgs {
  baseId: string;
  fieldId: string;
  /** Table the AI field belongs to. Required so the server can look up the record. */
  tableId: string;
  /** Record id whose AI cell we want to stream. */
  recordId: string;
  /** Optional override of the endpoint, mainly for tests. */
  endpoint?: string;
}

export interface IUseStreamingAIResult {
  streaming: boolean;
  value: string;
  error: Error | null;
  done: boolean;
  start: () => void;
  abort: () => void;
  reset: () => void;
}

interface IStreamPayload {
  delta?: string;
  done?: boolean;
  value?: string;
  error?: boolean;
  message?: string;
}

interface IParseResult {
  done: boolean;
  abortable: boolean;
  errorMessage?: string;
}

const readStream = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  onDelta: (delta: string) => void
): Promise<{ aborted: boolean; errorMessage?: string }> => {
  let buffer = '';
  for (;;) {
    const { value: chunk, done: readerDone } = await reader.read();
    if (readerDone) break;
    buffer += decoder.decode(chunk, { stream: true });
    const parts = splitEvents(buffer);
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const result = parsePayload(part, onDelta);
      if (result.abortable && result.errorMessage) {
        return { aborted: true, errorMessage: result.errorMessage };
      }
      if (result.done) {
        return { aborted: false };
      }
    }
  }
  return { aborted: false };
};

const splitEvents = (raw: string): string[] => raw.split(/\r?\n\r?\n/);

const extractEventPayload = (raw: string): string => {
  const dataLines = raw
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length));
  return dataLines.join('\n');
};

const parsePayload = (raw: string, onDelta: (delta: string) => void): IParseResult => {
  const payloadRaw = extractEventPayload(raw).trim();
  if (!payloadRaw) {
    return { done: false, abortable: false };
  }
  let payload: IStreamPayload;
  try {
    payload = JSON.parse(payloadRaw) as IStreamPayload;
  } catch {
    // Ignore malformed payloads — the upstream may have sent a heartbeat
    // (`: ping`) that we still parse as no-op.
    return { done: false, abortable: false };
  }
  if (payload.error) {
    return { done: true, abortable: true, errorMessage: payload.message ?? 'stream error' };
  }
  if (payload.delta) {
    onDelta(payload.delta);
  }
  if (payload.done) {
    return { done: true, abortable: false, errorMessage: undefined };
  }
  return { done: false, abortable: false };
};

export const useStreamingAI = (args: IUseStreamingAIArgs): IUseStreamingAIResult => {
  const { baseId, fieldId, tableId, recordId, endpoint } = args;
  const [streaming, setStreaming] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [done, setDone] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  const abort = useCallback(() => {
    if (controllerRef.current) {
      try {
        controllerRef.current.abort();
      } catch {
        // already aborted; ignore
      }
      controllerRef.current = null;
    }
    setStreaming(false);
  }, []);

  const reset = useCallback(() => {
    abort();
    setValue('');
    setError(null);
    setDone(false);
    startedRef.current = false;
  }, [abort]);

  const appendDelta = useCallback((delta: string) => {
    setValue((prev) => prev + delta);
  }, []);

  const start = useCallback(() => {
    if (startedRef.current) return;
    if (!baseId || !fieldId || !tableId || !recordId) {
      setError(new Error('useStreamingAI: baseId, fieldId, tableId, recordId are required'));
      return;
    }
    startedRef.current = true;
    setStreaming(true);
    setValue('');
    setError(null);
    setDone(false);

    const controller = new AbortController();
    controllerRef.current = controller;

    const url =
      endpoint ??
      `/api/${encodeURIComponent(baseId)}/ai/stream/${encodeURIComponent(fieldId)}?tableId=${encodeURIComponent(
        tableId
      )}&recordId=${encodeURIComponent(recordId)}`;

    void (async () => {
      const decoder = new TextDecoder();
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
          credentials: 'include',
        });
        if (!response.ok || !response.body) {
          throw new Error(`stream request failed: ${response.status}`);
        }
        const reader = response.body.getReader();
        const result = await readStream(reader, decoder, appendDelta);
        if (result.aborted && result.errorMessage) {
          throw new Error(result.errorMessage);
        }
        setDone(true);
        setStreaming(false);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
        setStreaming(false);
      } finally {
        controllerRef.current = null;
      }
    })();
  }, [baseId, fieldId, tableId, recordId, endpoint, appendDelta]);

  useEffect(() => {
    return () => {
      abort();
    };
  }, [abort]);

  return useMemo(
    () => ({ streaming, value, error, done, start, abort, reset }),
    [streaming, value, error, done, start, abort, reset]
  );
};
