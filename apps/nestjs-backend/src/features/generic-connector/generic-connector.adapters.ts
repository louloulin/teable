import { Logger } from '@nestjs/common';
import { isIP } from 'node:net';
import type { Response } from 'node-fetch';
import { safeFetch } from '../../utils/ssrf-http';
import type {
  GenericAdapterType,
  GenericFetchResult,
  GenericRecord,
  GenericSourceSpec,
} from './generic-connector.types';

/**
 * Round-23: Built-in adapters for the generic connector.
 *
 * Each adapter is a self-contained function (spec) => Promise<FetchResult>.
 * Adding a new adapter = write a function and call registerAdapter(type, fn).
 * No class hierarchy, no inheritance — keeps the surface area tiny.
 */

export type GenericAdapterFn = (spec: GenericSourceSpec) => Promise<GenericFetchResult>;

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

const requestOptions = (headers: Record<string, string>) => ({
  headers,
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});

function assertPublicEndpoint(endpoint: string): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('endpoint must be an absolute URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('endpoint protocol must be http or https');
  }
  if (url.username || url.password) {
    throw new Error('endpoint credentials are not allowed');
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const ipVersion = isIP(hostname);
  const isPrivateIpv4 =
    ipVersion === 4 &&
    (hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('127.') ||
      hostname.startsWith('169.254.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname));
  const normalizedIpv6 = hostname.replace(/:/g, '').toLowerCase();
  const isPrivateIpv6 =
    ipVersion === 6 &&
    (hostname === '::1' || hostname === '::' || normalizedIpv6.startsWith('fc') || normalizedIpv6.startsWith('fd') || normalizedIpv6.startsWith('fe80'));
  if (hostname === 'localhost' || isPrivateIpv4 || isPrivateIpv6) {
    throw new Error('endpoint resolves to a private or loopback address');
  }
}

async function readResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) throw new Error('response exceeds 10 MiB limit');
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error('response exceeds 10 MiB limit');
  }
  return text;
}

/** Walk a dotted path against an object — supports "data.items" / "result.records". */
function pluckPath(obj: unknown, path: string | undefined): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

function sampleRecords(arr: GenericRecord[], n = 5): GenericRecord[] {
  return arr.slice(0, n);
}

function buildResult(args: {
  ok: boolean;
  spec: GenericSourceSpec;
  records?: GenericRecord[];
  totalBytes?: number;
  error?: string;
  startMs: number;
}): GenericFetchResult {
  return {
    ok: args.ok,
    adapterType: args.spec.adapterType,
    endpoint: args.spec.endpoint,
    count: args.records?.length,
    sample: args.records ? sampleRecords(args.records) : undefined,
    totalBytes: args.totalBytes,
    durationMs: Date.now() - args.startMs,
    error: args.error,
    fetchedAt: new Date().toISOString(),
  };
}

// ---------- Adapter: json-endpoint ----------
// Simple GET that returns JSON; arrays become records, objects become single records.
export const jsonEndpointAdapter: GenericAdapterFn = async (spec) => {
  const startMs = Date.now();
  const logger = new Logger('jsonEndpointAdapter');
  try {
    assertPublicEndpoint(spec.endpoint);
    const res = await safeFetch(spec.endpoint, {
      method: spec.method ?? 'GET',
      ...requestOptions({
        Accept: 'application/json',
        ...(spec.token ? { Authorization: `Bearer ${spec.token}` } : {}),
        ...(spec.headers ?? {}),
      }),
    });
    if (!res.ok) {
      const text = await readResponseText(res).catch(() => '');
      return buildResult({
        ok: false,
        spec,
        error: `HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`,
        startMs,
      });
    }
    const raw = JSON.parse(await readResponseText(res)) as unknown;
    const body = pluckPath(raw, spec.recordsPath);
    const records: GenericRecord[] = Array.isArray(body)
      ? (body as GenericRecord[])
      : body && typeof body === 'object'
        ? [body as GenericRecord]
        : [];
    const totalBytes = JSON.stringify(raw).length;
    return buildResult({ ok: true, spec, records, totalBytes, startMs });
  } catch (err) {
    const msg = (err as Error).message;
    logger.warn(`json-endpoint fetch failed: ${msg}`);
    return buildResult({ ok: false, spec, error: msg, startMs });
  }
};

// ---------- Adapter: rest-api ----------
// POST-style paginated fetch; sends {limit, offset} body and reads back records list.
export const restApiAdapter: GenericAdapterFn = async (spec) => {
  const startMs = Date.now();
  const logger = new Logger('restApiAdapter');
  try {
    assertPublicEndpoint(spec.endpoint);
    const pagination = spec.pagination ?? {};
    const limit = pagination.limit ?? 100;
    const body = JSON.stringify({
      limit,
      offset: 0,
      ...(spec.meta ?? {}),
    });
    const res = await safeFetch(spec.endpoint, {
      method: spec.method ?? 'POST',
      ...requestOptions({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(spec.token ? { Authorization: `Bearer ${spec.token}` } : {}),
        ...(spec.headers ?? {}),
      }),
      body,
    });
    if (!res.ok) {
      const text = await readResponseText(res).catch(() => '');
      return buildResult({
        ok: false,
        spec,
        error: `HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`,
        startMs,
      });
    }
    const raw = JSON.parse(await readResponseText(res)) as unknown;
    const body2 = pluckPath(raw, spec.recordsPath ?? 'items');
    const records: GenericRecord[] = Array.isArray(body2)
      ? (body2 as GenericRecord[])
      : body2 && typeof body2 === 'object'
        ? [body2 as GenericRecord]
        : [];
    const totalBytes = JSON.stringify(raw).length;
    return buildResult({ ok: true, spec, records, totalBytes, startMs });
  } catch (err) {
    const msg = (err as Error).message;
    logger.warn(`rest-api fetch failed: ${msg}`);
    return buildResult({ ok: false, spec, error: msg, startMs });
  }
};

// ---------- Adapter: csv-url ----------
// Fetches CSV text from URL; first row = headers, subsequent rows = records.
export const csvUrlAdapter: GenericAdapterFn = async (spec) => {
  const startMs = Date.now();
  const logger = new Logger('csvUrlAdapter');
  try {
    assertPublicEndpoint(spec.endpoint);
    const res = await safeFetch(spec.endpoint, {
      method: spec.method ?? 'GET',
      ...requestOptions({
        Accept: 'text/csv, text/plain;q=0.9, */*;q=0.5',
        ...(spec.token ? { Authorization: `Bearer ${spec.token}` } : {}),
        ...(spec.headers ?? {}),
      }),
    });
    if (!res.ok) {
      const text = await readResponseText(res).catch(() => '');
      return buildResult({
        ok: false,
        spec,
        error: `HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`,
        startMs,
      });
    }
    const text = await readResponseText(res);
    const totalBytes = text.length;
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) {
      return buildResult({ ok: true, spec, records: [], totalBytes, startMs });
    }
    const headers = parseCsvLine(lines[0]);
    const records: GenericRecord[] = lines.slice(1).map((line) => {
      const cells = parseCsvLine(line);
      const rec: GenericRecord = {};
      headers.forEach((h, i) => {
        rec[h] = cells[i] ?? '';
      });
      return rec;
    });
    return buildResult({ ok: true, spec, records, totalBytes, startMs });
  } catch (err) {
    const msg = (err as Error).message;
    logger.warn(`csv-url fetch failed: ${msg}`);
    return buildResult({ ok: false, spec, error: msg, startMs });
  }
};

// Naive CSV line splitter (no quoted-field handling; kept simple for the
// minimal adapter — follow-ups can plug in a real csv parser).
function parseCsvLine(line: string): string[] {
  return line.split(',').map((s) => s.trim());
}

// ---------- Registry state ----------
const REGISTRY = new Map<string, GenericAdapterFn>();
const META = new Map<string, { displayName: string; description: string; builtin: boolean; registeredAt: string }>();

// Pre-register built-in adapters on module load.
const BUILTIN_ADAPTERS: Array<{
  type: GenericAdapterType;
  fn: GenericAdapterFn;
  displayName: string;
  description: string;
}> = [
  {
    type: 'rest-api',
    fn: restApiAdapter,
    displayName: 'REST API (POST + pagination)',
    description: 'POST request with JSON body {limit, offset}; expects {items: []} or array response',
  },
  {
    type: 'json-endpoint',
    fn: jsonEndpointAdapter,
    displayName: 'JSON Endpoint (GET)',
    description: 'Simple GET that returns JSON; arrays or single objects become records',
  },
  {
    type: 'csv-url',
    fn: csvUrlAdapter,
    displayName: 'CSV URL',
    description: 'Fetches CSV text from URL; first row treated as headers',
  },
];

const REGISTRATION_TS = new Date().toISOString();
for (const a of BUILTIN_ADAPTERS) {
  REGISTRY.set(a.type, a.fn);
  META.set(a.type, {
    displayName: a.displayName,
    description: a.description,
    builtin: true,
    registeredAt: REGISTRATION_TS,
  });
}

export function registerAdapter(type: string, fn: GenericAdapterFn, meta?: { displayName?: string; description?: string }): void {
  REGISTRY.set(type, fn);
  META.set(type, {
    displayName: meta?.displayName ?? type,
    description: meta?.description ?? '',
    builtin: false,
    registeredAt: new Date().toISOString(),
  });
}

export function getAdapter(type: string): GenericAdapterFn | null {
  return REGISTRY.get(type) ?? null;
}

export function listAdapterTypes(): string[] {
  return Array.from(REGISTRY.keys()).sort();
}

export function listAdapterInfos(): Array<{
  type: string;
  displayName: string;
  description: string;
  builtin: boolean;
  registeredAt: string;
}> {
  return Array.from(META.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, m]) => ({ type, ...m }));
}
