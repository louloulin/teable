/**
 * Automation Trigger Catalog — pure helpers spec (Stage 108).
 */

import {
  BUILTIN_TRIGGER_CATALOG,
  capTriggerCatalog,
  getTriggerSpec,
  groupTriggersByCategory,
  indexTriggerCatalog,
  listTriggersByCategory,
  mergeTriggerCatalogs,
  missingTriggerFields,
  hasTriggerOutputKey,
  serializeTriggerCatalog,
  summarizeTriggerCatalog,
  validateTriggerConfig,
} from './automation-trigger-catalog.service';
import { ITriggerCatalog } from './automation-trigger-catalog.types';

describe('automation-trigger-catalog.builtins', () => {
  it('has 6 builtin types', () => {
    expect(BUILTIN_TRIGGER_CATALOG.types.length).toBe(6);
  });
  it('default is record_created', () => {
    expect(BUILTIN_TRIGGER_CATALOG.defaultType).toBe('record_created');
  });
});

describe('automation-trigger-catalog.index / get', () => {
  it('indexes by type', () => {
    const idx = indexTriggerCatalog(BUILTIN_TRIGGER_CATALOG);
    expect(idx.get('record_created')?.label).toBe('Record created');
  });
  it('returns undefined for unknown', () => {
    expect(getTriggerSpec(BUILTIN_TRIGGER_CATALOG, 'nope')).toBeUndefined();
  });
});

describe('automation-trigger-catalog.list / group', () => {
  it('list by category', () => {
    const rec = listTriggersByCategory(BUILTIN_TRIGGER_CATALOG, 'record');
    expect(rec.length).toBe(3);
  });
  it('group by category', () => {
    const g = groupTriggersByCategory(BUILTIN_TRIGGER_CATALOG);
    expect(g['record'].length).toBe(3);
    expect(g['schedule'].length).toBe(1);
  });
});

describe('automation-trigger-catalog.validate', () => {
  it('valid record_created config', () => {
    const v = validateTriggerConfig(BUILTIN_TRIGGER_CATALOG, 'record_created', { tableId: 'tbl1' });
    expect(v.ok).toBe(true);
    expect(v.normalized.tableId).toBe('tbl1');
    expect(v.normalized.filter).toEqual({});
  });
  it('flags missing required field', () => {
    const v = validateTriggerConfig(BUILTIN_TRIGGER_CATALOG, 'record_created', {});
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.field === 'tableId')).toBe(true);
  });
  it('flags unknown type', () => {
    const v = validateTriggerConfig(BUILTIN_TRIGGER_CATALOG, 'bogus', {});
    expect(v.ok).toBe(false);
  });
  it('flags bad cron', () => {
    const v = validateTriggerConfig(BUILTIN_TRIGGER_CATALOG, 'schedule', { cron: 'not-a-cron!' });
    expect(v.ok).toBe(false);
  });
  it('flags bad select', () => {
    const v = validateTriggerConfig(BUILTIN_TRIGGER_CATALOG, 'record_created', { tableId: 'tbl1', extra: 'nope' });
    expect(v.normalized.tableId).toBe('tbl1');
    expect(v.ok).toBe(true);
  });
});

describe('automation-trigger-catalog.merge / cap', () => {
  it('merge extends with override', () => {
    const ext: ITriggerCatalog = {
      version: 2,
      defaultType: 'manual',
      types: [{ ...BUILTIN_TRIGGER_CATALOG.types[0], label: 'New' }],
    };
    const m = mergeTriggerCatalogs(BUILTIN_TRIGGER_CATALOG, ext);
    expect(m.types[0].label).toBe('New');
    expect(m.defaultType).toBe('manual');
  });
  it('cap truncates', () => {
    const big: ITriggerCatalog = {
      version: 1,
      defaultType: 'x',
      types: Array.from({ length: 100 }, (_, i) => ({
        type: `t${i}`,
        label: `T${i}`,
        category: 'system',
        description: '',
        icon: '',
        fields: [],
        outputKeys: [],
      })),
    };
    const c = capTriggerCatalog(big);
    expect(c.types.length).toBe(64);
  });
});

describe('automation-trigger-catalog.missing / hasOutput / serialize / summarize', () => {
  it('missing fields', () => {
    expect(missingTriggerFields(BUILTIN_TRIGGER_CATALOG, 'record_created', {})).toContain('tableId');
    expect(missingTriggerFields(BUILTIN_TRIGGER_CATALOG, 'record_created', { tableId: 't' })).toEqual([]);
  });
  it('hasOutput', () => {
    expect(hasTriggerOutputKey(BUILTIN_TRIGGER_CATALOG, 'record_created', 'recordId')).toBe(true);
    expect(hasTriggerOutputKey(BUILTIN_TRIGGER_CATALOG, 'record_created', 'nope')).toBe(false);
  });
  it('serialize', () => {
    expect(serializeTriggerCatalog(BUILTIN_TRIGGER_CATALOG).length).toBeGreaterThan(0);
  });
  it('summarize', () => {
    const s = summarizeTriggerCatalog(BUILTIN_TRIGGER_CATALOG);
    expect(s.count).toBe(6);
    expect(s.categories['record']).toBe(3);
  });
});