import { ConditionalFormatService } from './conditional-format.service';
import { vi } from 'vitest';
import type { ICfRuleRow } from './conditional-format.types';

interface MockStore {
  conditionalFormatRule: {
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
}

const buildPrisma = (): MockStore => ({
  conditionalFormatRule: {
    findMany: vi.fn(async () => []),
    upsert: vi.fn(async ({ where, create, update }) => ({
      id: where.id,
      ...create,
      ...update,
    })),
    delete: vi.fn(async () => undefined),
  },
});

const rule = (over: Partial<ICfRuleRow>): ICfRuleRow => ({
  id: 'cf_1',
  viewId: 'v1',
  name: 'rule',
  fieldId: 'field_a',
  operator: 'eq',
  value: 'X',
  style: { bgColor: '#fff000' },
  priority: 100,
  enabled: true,
  createdTime: new Date(),
  ...over,
});

describe('ConditionalFormatService (Stage 18)', () => {
  let svc: ConditionalFormatService;
  let store: MockStore;

  beforeEach(() => {
    store = buildPrisma();
    svc = new ConditionalFormatService(store as never);
  });

  it('listByView sorts by priority ASC at read time', async () => {
    store.conditionalFormatRule.findMany.mockResolvedValueOnce([
      rule({ id: 'r_low', priority: 200 }),
      rule({ id: 'r_high', priority: 10 }),
    ]);
    const rows = await svc.listByView('v1');
    expect(rows.map((r) => r.id)).toEqual(['r_high', 'r_low']);
  });

  it('upsert rejects unknown operators', async () => {
    await expect(
      svc.upsert('v1', null, {
        name: 'bad',
        fieldId: 'a',
        operator: 'regex' as never,
        value: null,
        style: { bgColor: '#fff' },
      })
    ).rejects.toThrow(/invalid operator/);
  });

  it('upsert creates with new id when id is null', async () => {
    const out = await svc.upsert('v1', null, {
      name: 'foo',
      fieldId: 'field_a',
      operator: 'eq',
      value: 'X',
      style: { bgColor: '#f00' },
    });
    expect(out.id).toMatch(/^cf_/);
    expect(store.conditionalFormatRule.upsert).toHaveBeenCalled();
  });

  it('delete returns false when row absent', async () => {
    store.conditionalFormatRule.delete.mockRejectedValueOnce(new Error('nf'));
    const ok = await svc.delete('missing');
    expect(ok).toBe(false);
  });

  it('delete returns true on success', async () => {
    const ok = await svc.delete('cf_1');
    expect(ok).toBe(true);
  });

  it('evaluate: eq operator matches exactly', () => {
    const result = svc.evaluate([rule({ operator: 'eq', value: 'high' })], { field_a: 'high' });
    expect(result.fieldStyles.field_a).toEqual({ bgColor: '#fff000' });
  });

  it('evaluate: neq operator excludes null', () => {
    const r = svc.evaluate([rule({ operator: 'neq', value: 'x' })], { field_a: null });
    expect(r.fieldStyles).toEqual({});
  });

  it('evaluate: numeric coercion for gt', () => {
    const r = svc.evaluate([rule({ operator: 'gt', value: 10 })], { field_a: '12' });
    expect(r.fieldStyles.field_a).toBeTruthy();
  });

  it('evaluate: contains is case-insensitive substring', () => {
    const r = svc.evaluate([rule({ operator: 'contains', value: 'OO' })], { field_a: 'Foo Bar' });
    expect(r.fieldStyles.field_a).toBeTruthy();
  });

  it('evaluate: empty / not_empty operate on the field value', () => {
    expect(
      svc.evaluate([rule({ operator: 'empty', style: { bgColor: '#111' } })], { field_a: '' })
        .fieldStyles.field_a
    ).toEqual({ bgColor: '#111' });
    expect(
      svc.evaluate([rule({ operator: 'not_empty', style: { bgColor: '#222' } })], { field_a: 'x' })
        .fieldStyles.field_a
    ).toEqual({ bgColor: '#222' });
  });

  it('evaluate: in operator checks array membership', () => {
    const r = svc.evaluate([rule({ operator: 'in', value: ['a', 'b'] })], { field_a: 'b' });
    expect(r.fieldStyles.field_a).toBeTruthy();
  });

  it('evaluate: lower-priority rules are overridden by higher-priority', () => {
    const r = svc.evaluate(
      [
        rule({ id: 'low', priority: 200, style: { bgColor: '#111' } }),
        rule({ id: 'high', priority: 10, style: { bgColor: '#222' } }),
      ],
      { field_a: 'X' }
    );
    expect(r.fieldStyles.field_a.bgColor).toBe('#222');
  });

  it('evaluate: row-level rules apply to whole row', () => {
    const r = svc.evaluate(
      [
        rule({
          fieldId: null,
          operator: 'not_empty',
          style: { italic: true },
          priority: 1,
        }),
      ],
      { field_a: 'x' }
    );
    expect(r.rowStyle).toEqual({ italic: true });
  });

  it('evaluate: disabled rules are ignored', () => {
    const r = svc.evaluate([rule({ enabled: false, style: { bgColor: '#fff' } })], {
      field_a: 'X',
    });
    expect(r.fieldStyles).toEqual({});
  });
});
