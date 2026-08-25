import {
  DEFAULT_BATCH_SIZE,
  deliverSiemBatch,
  exportAuditEvents,
  mimeFor,
  signPayload,
  toCsv,
  toJson,
  toJsonl,
} from './audit-export.service';
import type { IAuditEventRow, ISiemWebhookInput } from './audit-export.types';

const sampleEvent = (over: Partial<IAuditEventRow> = {}): IAuditEventRow => ({
  id: 'ev1',
  organizationId: 'org_1',
  actorId: 'u1',
  action: 'user.login',
  detail: { ip: '1.2.3.4', method: 'password' },
  ipAddress: '1.2.3.4',
  requestId: 'r1',
  createdTime: new Date('2026-08-25T00:00:00.000Z'),
  ...over,
});

describe('Audit export (Stage 24)', () => {
  describe('CSV', () => {
    it('emits a header row + one row per event with JSON detail', () => {
      const csv = toCsv([sampleEvent(), sampleEvent({ id: 'ev2', action: 'record.create' })]);
      const lines = csv.split('\n');
      expect(lines[0]).toBe(
        'id,createdTime,organizationId,actorId,action,ipAddress,requestId,detail'
      );
      expect(lines).toHaveLength(3);
      expect(lines[1]).toContain('ev1,2026-08-25T00:00:00.000Z,org_1,u1,user.login,1.2.3.4,r1,');
      expect(lines[2]).toContain('ev2,');
    });

    it('escapes commas, quotes, and newlines', () => {
      const csv = toCsv([sampleEvent({ detail: { msg: 'hi, [world]\nbye' } })]);
      // detail column is quoted because the JSON contains a comma;
      // the JSON's own quotes are CSV-doubled.
      expect(csv).toContain('"{""msg"":""hi, [world]\\nbye""}"');
      // The embedded newline survived the JSON round-trip as a literal
      // "\n" two-char sequence inside the quoted field.
      expect(csv).toContain('[world]\\nbye');
    });
  });

  describe('JSON / JSONL', () => {
    it('JSON envelope has schema + count + serialized events', () => {
      const out = toJson([sampleEvent()]);
      const parsed = JSON.parse(out);
      expect(parsed.schema).toBe('teable.audit.batch.v1');
      expect(parsed.count).toBe(1);
      expect(parsed.events[0].action).toBe('user.login');
      expect(parsed.events[0].createdTime).toBe('2026-08-25T00:00:00.000Z');
    });

    it('JSONL yields one JSON object per line', () => {
      const lines = toJsonl([sampleEvent(), sampleEvent({ id: 'ev2' })]).split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).id).toBe('ev1');
      expect(JSON.parse(lines[1]).id).toBe('ev2');
    });
  });

  describe('exportAuditEvents', () => {
    it('routes by format and stamps a filename', () => {
      const csv = exportAuditEvents({ events: [sampleEvent()], format: 'csv' });
      expect(csv.mimeType).toBe('text/csv; charset=utf-8');
      expect(csv.filename).toMatch(/^audit-\d{4}-\d{2}-\d{2}T.*\.csv$/);
      expect(csv.rowCount).toBe(1);
    });

    it('filters by date window', () => {
      const events = [
        sampleEvent({ id: 'a', createdTime: new Date('2026-01-01T00:00:00Z') }),
        sampleEvent({ id: 'b', createdTime: new Date('2026-06-01T00:00:00Z') }),
        sampleEvent({ id: 'c', createdTime: new Date('2026-12-31T00:00:00Z') }),
      ];
      const out = exportAuditEvents({
        events,
        format: 'json',
        from: new Date('2026-05-01T00:00:00Z'),
        to: new Date('2026-11-01T00:00:00Z'),
      });
      const parsed = JSON.parse(out.body);
      expect(parsed.events.map((e: { id: string }) => e.id)).toEqual(['b']);
    });

    it('mimeFor returns the right Content-Type', () => {
      expect(mimeFor('csv')).toBe('text/csv; charset=utf-8');
      expect(mimeFor('jsonl')).toBe('application/x-ndjson; charset=utf-8');
      expect(mimeFor('json')).toBe('application/json; charset=utf-8');
    });
  });

  describe('signPayload', () => {
    it('produces a Stripe-style t=,v1= signature', () => {
      const sig = signPayload('topsecret', '{"hello":"world"}', 1700000000);
      expect(sig).toMatch(/^t=1700000000,v1=[a-f0-9]{64}$/);
    });

    it('changes when the body changes (1-bit flip)', () => {
      const a = signPayload('topsecret', '{"x":1}', 1700000000);
      const b = signPayload('topsecret', '{"x":2}', 1700000000);
      expect(a).not.toBe(b);
    });
  });

  describe('deliverSiemBatch', () => {
    const webhook: ISiemWebhookInput = {
      id: 'wh1',
      organizationId: 'org_1',
      label: 'Splunk prod',
      url: 'https://siem.example.com/audit',
      secret: 'topsecret',
      enabled: true,
      actions: [],
    };

    it('returns 204 immediately when no event matches the action filter', async () => {
      const filter: ISiemWebhookInput = { ...webhook, actions: ['record.create'] };
      const r = await deliverSiemBatch({
        webhook: filter,
        events: [sampleEvent({ action: 'user.login' })],
      });
      expect(r).toEqual({ ok: true, status: 204, attempts: 0 });
    });

    it('delivers a signed body and returns ok on 2xx', async () => {
      const calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
      const r = await deliverSiemBatch({
        webhook,
        events: [sampleEvent()],
        transport: async (input) => {
          calls.push(input);
          return { ok: true, status: 200 };
        },
      });
      expect(r.ok).toBe(true);
      expect(r.status).toBe(200);
      expect(calls).toHaveLength(1);
      expect(calls[0].headers['Content-Type']).toContain('application/json');
      expect(calls[0].headers['X-Teable-Signature']).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    });

    it('retries on 5xx and gives up after 3 attempts', async () => {
      const calls: number[] = [];
      const r = await deliverSiemBatch({
        webhook,
        events: [sampleEvent()],
        transport: async () => {
          calls.push(1);
          return { ok: false, status: 503 };
        },
      });
      expect(r.ok).toBe(false);
      expect(r.attempts).toBe(3);
      expect(calls).toHaveLength(3);
    });

    it('does NOT retry on 4xx (client error)', async () => {
      const calls: number[] = [];
      const r = await deliverSiemBatch({
        webhook,
        events: [sampleEvent()],
        transport: async () => {
          calls.push(1);
          return { ok: false, status: 401 };
        },
      });
      expect(r.ok).toBe(false);
      expect(r.attempts).toBe(1);
      expect(calls).toHaveLength(1);
    });

    it('retries on 429', async () => {
      let n = 0;
      const r = await deliverSiemBatch({
        webhook,
        events: [sampleEvent()],
        transport: async () => {
          n++;
          if (n < 2) return { ok: false, status: 429 };
          return { ok: true, status: 200 };
        },
      });
      expect(r.ok).toBe(true);
      expect(r.attempts).toBe(2);
    });
  });

  describe('DEFAULT_BATCH_SIZE + chunk helper', () => {
    it('default batch size is 200', () => {
      expect(DEFAULT_BATCH_SIZE).toBe(200);
    });
  });
});
