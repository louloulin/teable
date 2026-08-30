/**
 * Audit log export + SIEM forwarding — Stage 24.
 *
 * Pure functions for:
 *   - serialize events to CSV / JSON / JSONL
 *   - sign a payload with HMAC-SHA256 for the X-Teable-Signature header
 *   - deliver a batch to a SIEM endpoint with bounded retry
 *
 * No Prisma, no fetch — kept testable + deterministic.
 */

import { createHmac } from 'crypto';

import type {
  AuditExportFormat,
  IAuditEventRow,
  IAuditExportInput,
  IAuditExportResult,
  ISiemDeliverInput,
} from './audit-export.types';

/** Headers every SIEM POST carries. */
export const SIEM_HEADERS = {
  contentType: 'application/json; charset=utf-8',
  userAgent: 'Teable-AuditExporter/1.0',
  signatureHeader: 'X-Teable-Signature',
  deliveryHeader: 'X-Teable-Delivery',
  retryHeader: 'X-Teable-Retry',
} as const;

/** Default batch size — chosen so a 100 KB JSON body fits under common WAF limits. */
export const DEFAULT_BATCH_SIZE = 200;

/** Default delivery timeout. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Serialize a batch of events as JSONL (one event per line). */
export function toJsonl(events: IAuditEventRow[]): string {
  return events.map(eventToJsonLine).join('\n');
}

/** Serialize a batch of events as a JSON envelope. */
export function toJson(events: IAuditEventRow[]): string {
  return JSON.stringify(
    {
      schema: 'teable.audit.batch.v1',
      generatedAt: new Date().toISOString(),
      count: events.length,
      events: events.map((e) => serializeEvent(e)),
    },
    null,
    2
  );
}

/** Serialize a batch of events as RFC 4180 CSV. */
export function toCsv(events: IAuditEventRow[]): string {
  const headers = [
    'id',
    'createdTime',
    'organizationId',
    'actorId',
    'action',
    'ipAddress',
    'requestId',
    'detail',
  ];
  const rows = [headers.join(',')];
  for (const e of events) {
    rows.push(
      [
        e.id,
        e.createdTime.toISOString(),
        e.organizationId ?? '',
        e.actorId ?? '',
        e.action,
        e.ipAddress ?? '',
        e.requestId ?? '',
        csvEscape(JSON.stringify(e.detail ?? null)),
      ].join(',')
    );
  }
  return rows.join('\n');
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Top-level dispatcher used by the export controller. */
export function exportAuditEvents(input: IAuditExportInput): IAuditExportResult {
  const filtered = filterByDate(input.events, input.from, input.to);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  switch (input.format) {
    case 'csv':
      return {
        body: toCsv(filtered),
        mimeType: 'text/csv; charset=utf-8',
        filename: `audit-${stamp}.csv`,
        rowCount: filtered.length,
      };
    case 'jsonl':
      return {
        body: toJsonl(filtered),
        mimeType: 'application/x-ndjson; charset=utf-8',
        filename: `audit-${stamp}.jsonl`,
        rowCount: filtered.length,
      };
    case 'json':
    default:
      return {
        body: toJson(filtered),
        mimeType: 'application/json; charset=utf-8',
        filename: `audit-${stamp}.json`,
        rowCount: filtered.length,
      };
  }
}

/** Format-aware MIME type lookup, exposed so callers can pre-set `Content-Type`. */
export function mimeFor(format: AuditExportFormat): string {
  switch (format) {
    case 'csv':
      return 'text/csv; charset=utf-8';
    case 'jsonl':
      return 'application/x-ndjson; charset=utf-8';
    case 'json':
    default:
      return 'application/json; charset=utf-8';
  }
}

/**
 * Sign a payload with HMAC-SHA256. The signature is `t=<unix>,v1=<hex>`
 * (mirrors the Stripe / GitHub webhook convention) so a single secret
 * can be rotated without breaking in-flight deliveries.
 */
export function signPayload(
  secret: string,
  body: string,
  nowSec = Math.floor(Date.now() / 1000)
): string {
  const hmac = createHmac('sha256', secret).update(`${nowSec}.${body}`).digest('hex');
  return `t=${nowSec},v1=${hmac}`;
}

/**
 * Deliver a batch to a SIEM endpoint. Returns true on a 2xx response;
 * false otherwise. The transport is injectable so tests don't hit
 * the network.
 */
export async function deliverSiemBatch(input: ISiemDeliverInput): Promise<{
  ok: boolean;
  status: number;
  attempts: number;
}> {
  const filtered = filterByAction(input.events, input.webhook.actions);
  if (filtered.length === 0) {
    return { ok: true, status: 204, attempts: 0 };
  }
  const body = toJson(filtered);
  const signature = signPayload(input.webhook.secret, body);
  const headers: Record<string, string> = {
    /* eslint-disable @typescript-eslint/naming-convention */
    'Content-Type': SIEM_HEADERS.contentType,
    'User-Agent': SIEM_HEADERS.userAgent,
    /* eslint-enable @typescript-eslint/naming-convention */
    [SIEM_HEADERS.signatureHeader]: signature,
    [SIEM_HEADERS.deliveryHeader]: `dlv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  };
  const transport = input.transport ?? defaultTransport;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await transport({ url: input.webhook.url, body, headers });
      lastStatus = r.status;
      if (r.ok) {
        return { ok: true, status: r.status, attempts: attempt };
      }
      // Retry on 5xx + 429.
      if (r.status >= 500 || r.status === 429) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return { ok: false, status: r.status, attempts: attempt };
    } catch {
      await sleep(backoffMs(attempt));
    }
  }
  return { ok: false, status: lastStatus, attempts: 3 };
}

async function defaultTransport(input: {
  url: string;
  body: string;
  headers: Record<string, string>;
}): Promise<{ ok: boolean; status: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const r = await fetch(input.url, {
      method: 'POST',
      headers: input.headers,
      body: input.body,
      signal: ctrl.signal,
    });
    return { ok: r.ok, status: r.status };
  } finally {
    clearTimeout(timer);
  }
}

function backoffMs(attempt: number): number {
  // 200ms, 600ms, 1.4s — bounded jitter-free so tests stay deterministic.
  return 200 * attempt * attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function filterByDate(events: IAuditEventRow[], from?: Date, to?: Date): IAuditEventRow[] {
  if (!from && !to) return events;
  const f = from?.getTime() ?? -Infinity;
  const t = to?.getTime() ?? Infinity;
  return events.filter((e) => {
    const ms = e.createdTime.getTime();
    return ms >= f && ms <= t;
  });
}

function filterByAction(events: IAuditEventRow[], actions: string[]): IAuditEventRow[] {
  if (!actions || actions.length === 0) return events;
  const set = new Set(actions);
  return events.filter((e) => set.has(e.action));
}

function eventToJsonLine(e: IAuditEventRow): string {
  return JSON.stringify(serializeEvent(e));
}

function serializeEvent(e: IAuditEventRow): Record<string, unknown> {
  return {
    id: e.id,
    organizationId: e.organizationId,
    actorId: e.actorId,
    action: e.action,
    detail: e.detail ?? null,
    ipAddress: e.ipAddress,
    requestId: e.requestId,
    createdTime: e.createdTime.toISOString(),
  };
}
