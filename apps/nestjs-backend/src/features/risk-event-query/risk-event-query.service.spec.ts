/**
 * Risk event query DSL — pure helpers spec (Stage 79).
 */

import {
  buildQuery,
  cursorWhere,
  isRiskBand,
  isRiskDecision,
  isRiskEventKind,
  matchRow,
  nextCursor,
  normalizeFilter,
  orderBy,
  paginate,
  toWhere,
  validateFilter,
} from './risk-event-query.service';
import type { IRiskEventRow } from './risk-event-query.types';

const baseRow = (over: Partial<IRiskEventRow> = {}): IRiskEventRow => ({
  id: 'e1',
  orgId: 'o1',
  actorId: 'u1',
  kind: 'risk-decision',
  decision: 'allow',
  band: 'low',
  detail: 'clean login',
  occurredAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('risk-event-query.isRiskDecision / isRiskBand / isRiskEventKind', () => {
  it('accepts known', () => {
    expect(isRiskDecision('allow')).toBe(true);
    expect(isRiskBand('high')).toBe(true);
    expect(isRiskEventKind('risk-decision')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isRiskDecision('??')).toBe(false);
    expect(isRiskBand('??')).toBe(false);
    expect(isRiskEventKind('??')).toBe(false);
  });
});

describe('risk-event-query.validateFilter', () => {
  it('passes a good filter', () => {
    expect(validateFilter({ orgIds: ['o1'] })).toBeNull();
  });
  it('rejects too many orgs', () => {
    const ids = Array.from({ length: 64 }, (_, i) => `o${i}`);
    expect(validateFilter({ orgIds: ids })).toContain('orgIds');
  });
  it('rejects too many actors', () => {
    const ids = Array.from({ length: 128 }, (_, i) => `u${i}`);
    expect(validateFilter({ actorIds: ids })).toContain('actorIds');
  });
  it('rejects unknown decision', () => {
    expect(validateFilter({ decisions: ['unknown' as never] })).toBe('unknown decision');
  });
  it('rejects unknown band', () => {
    expect(validateFilter({ bands: ['unknown' as never] })).toBe('unknown band');
  });
  it('rejects unknown kind', () => {
    expect(validateFilter({ kinds: ['unknown' as never] })).toBe('unknown kind');
  });
  it('rejects from >= to', () => {
    expect(validateFilter({ from: '2026-01-02T00:00:00Z', to: '2026-01-01T00:00:00Z' })).toBe(
      'from >= to'
    );
  });
  it('rejects oversized text', () => {
    expect(validateFilter({ text: 'a'.repeat(200) })).toContain('text');
  });
  it('rejects limit out of range', () => {
    expect(validateFilter({ limit: 0 })).toContain('limit');
    expect(validateFilter({ limit: 99999 })).toContain('limit');
  });
});

describe('risk-event-query.normalizeFilter', () => {
  it('applies defaults', () => {
    const f = normalizeFilter({});
    expect(f.limit).toBe(50);
    expect(f.order).toBe('desc');
  });
});

describe('risk-event-query.buildQuery', () => {
  it('throws on bad filter', () => {
    expect(() => buildQuery({ filter: { limit: 0 } })).toThrow();
  });
  it('builds normalized', () => {
    const q = buildQuery({ filter: {} });
    expect(q.filter.limit).toBe(50);
  });
});

describe('risk-event-query.toWhere', () => {
  it('compiles orgIds', () => {
    expect(toWhere({ orgIds: ['o1', 'o2'] })).toEqual({ orgId: { in: ['o1', 'o2'] } });
  });
  it('compiles time range', () => {
    expect(toWhere({ from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' })).toEqual({
      occurredAt: { gte: '2026-01-01T00:00:00Z', lt: '2026-01-02T00:00:00Z' },
    });
  });
  it('compiles text search', () => {
    expect(toWhere({ text: 'spam' })).toEqual({
      detail: { contains: 'spam', mode: 'insensitive' },
    });
  });
  it('combines', () => {
    const w = toWhere({
      orgIds: ['o1'],
      bands: ['high'],
      decisions: ['hard-block'],
      text: 'x',
    });
    expect(Object.keys(w).sort()).toEqual(['band', 'decision', 'detail', 'orgId']);
  });
});

describe('risk-event-query.cursorWhere', () => {
  it('desc OR', () => {
    const w = cursorWhere({
      filter: { order: 'desc' },
      cursor: { key: '2026-01-01T00:00:00Z', id: 'x' },
    });
    expect(w['OR']).toBeDefined();
  });
  it('asc OR', () => {
    const w = cursorWhere({
      filter: { order: 'asc' },
      cursor: { key: '2026-01-01T00:00:00Z', id: 'x' },
    });
    expect(w['OR']).toBeDefined();
  });
});

describe('risk-event-query.orderBy', () => {
  it('desc default', () => {
    expect(orderBy({})[0]?.['occurredAt']).toBe('desc');
  });
  it('asc', () => {
    expect(orderBy({ order: 'asc' })[0]?.['occurredAt']).toBe('asc');
  });
});

describe('risk-event-query.nextCursor', () => {
  it('null when no last', () => {
    expect(nextCursor({ last: null })).toBeNull();
  });
  it('builds cursor', () => {
    const c = nextCursor({ last: baseRow() });
    expect(c?.key).toBe('2026-01-01T00:00:00Z');
    expect(c?.id).toBe('e1');
  });
});

describe('risk-event-query.matchRow', () => {
  it('matches everything', () => {
    expect(matchRow({ row: baseRow(), filter: {} })).toBe(true);
  });
  it('orgId mismatch', () => {
    expect(matchRow({ row: baseRow(), filter: { orgIds: ['o2'] } })).toBe(false);
  });
  it('from mismatch', () => {
    expect(
      matchRow({
        row: baseRow({ occurredAt: '2026-01-01T00:00:00Z' }),
        filter: { from: '2026-02-01T00:00:00Z' },
      })
    ).toBe(false);
  });
  it('text contains', () => {
    expect(
      matchRow({ row: baseRow({ detail: 'spam burst detected' }), filter: { text: 'BURST' } })
    ).toBe(true);
  });
  it('decision null and filtered', () => {
    expect(matchRow({ row: baseRow({ decision: null }), filter: { decisions: ['allow'] } })).toBe(
      false
    );
  });
});

describe('risk-event-query.paginate', () => {
  it('paginates desc with limit', () => {
    const rows: IRiskEventRow[] = Array.from({ length: 7 }, (_, i) =>
      baseRow({ id: `e${i}`, occurredAt: `2026-01-0${i + 1}T00:00:00Z` })
    );
    const page = paginate({ rows, filter: { limit: 3, order: 'desc' } });
    expect(page.rows.length).toBe(3);
    expect(page.rows[0]!.id).toBe('e6');
    expect(page.nextCursor).not.toBeNull();
  });
  it('uses cursor', () => {
    const rows: IRiskEventRow[] = Array.from({ length: 5 }, (_, i) =>
      baseRow({ id: `e${i}`, occurredAt: `2026-01-0${i + 1}T00:00:00Z` })
    );
    const page1 = paginate({ rows, filter: { limit: 2, order: 'desc' } });
    const page2 = paginate({
      rows,
      filter: { limit: 2, order: 'desc', cursor: page1.nextCursor! },
    });
    expect(page2.rows[0]!.id).not.toBe(page1.rows[0]!.id);
  });
});
