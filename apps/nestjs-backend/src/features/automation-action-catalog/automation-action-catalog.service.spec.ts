/**
 * Automation Action Catalog — pure helpers spec (Stage 109).
 */

import {
  BUILTIN_ACTION_CATALOG,
  capActionCatalog,
  computeRetryDelay,
  getActionSpec,
  groupActionsByCategory,
  indexActionCatalog,
  isRollbackable,
  listActionsByCategory,
  mergeActionCatalogs,
  serializeActionCatalog,
  summarizeActionCatalog,
  validateActionConfig,
} from './automation-action-catalog.service';
import { IActionCatalog, IActionRetrySpec } from './automation-action-catalog.types';

describe('automation-action-catalog.builtins', () => {
  it('has 6 builtin types', () => {
    expect(BUILTIN_ACTION_CATALOG.types.length).toBe(6);
  });
  it('default is update_record', () => {
    expect(BUILTIN_ACTION_CATALOG.defaultType).toBe('update_record');
  });
});

describe('automation-action-catalog.index / get', () => {
  it('indexes by type', () => {
    const idx = indexActionCatalog(BUILTIN_ACTION_CATALOG);
    expect(idx.get('send_email')?.label).toBe('Send email');
  });
  it('returns undefined for unknown', () => {
    expect(getActionSpec(BUILTIN_ACTION_CATALOG, 'nope')).toBeUndefined();
  });
});

describe('automation-action-catalog.group / list', () => {
  it('groups', () => {
    const g = groupActionsByCategory(BUILTIN_ACTION_CATALOG);
    expect(g['notification'].length).toBe(2);
  });
  it('lists by category', () => {
    expect(listActionsByCategory(BUILTIN_ACTION_CATALOG, 'record').length).toBe(1);
  });
});

describe('automation-action-catalog.validate', () => {
  it('valid send_email config', () => {
    const v = validateActionConfig(BUILTIN_ACTION_CATALOG, 'send_email', { to: 'a@b', subject: 's', body: 'b' });
    expect(v.ok).toBe(true);
    expect(v.retry.maxAttempts).toBe(5);
  });
  it('flags missing required', () => {
    const v = validateActionConfig(BUILTIN_ACTION_CATALOG, 'send_email', { to: 'a@b' });
    expect(v.ok).toBe(false);
    expect(v.issues.length).toBe(2);
  });
  it('flags unknown type', () => {
    const v = validateActionConfig(BUILTIN_ACTION_CATALOG, 'bogus', {});
    expect(v.ok).toBe(false);
  });
  it('flags bad select', () => {
    const v = validateActionConfig(BUILTIN_ACTION_CATALOG, 'notify_user', { userId: 'u', message: 'm', channel: 'sms' });
    expect(v.ok).toBe(false);
  });
  it('applies defaults', () => {
    const v = validateActionConfig(BUILTIN_ACTION_CATALOG, 'notify_user', { userId: 'u', message: 'm' });
    expect(v.ok).toBe(true);
    expect(v.normalized.channel).toBe('in-app');
  });
});

describe('automation-action-catalog.computeRetryDelay', () => {
  it('exponential', () => {
    const total = computeRetryDelay({ maxAttempts: 3, backoff: 'exponential', initialDelayMs: 1000 });
    expect(total).toBe(1000 + 2000 + 4000);
  });
  it('linear', () => {
    const total = computeRetryDelay({ maxAttempts: 3, backoff: 'linear', initialDelayMs: 1000 });
    expect(total).toBe(1000 + 2000 + 3000);
  });
  it('none', () => {
    const total = computeRetryDelay({ maxAttempts: 3, backoff: 'none', initialDelayMs: 1000 });
    expect(total).toBe(0);
  });
});

describe('automation-action-catalog.isRollbackable', () => {
  it('update_record is rollbackable', () => {
    expect(isRollbackable(BUILTIN_ACTION_CATALOG, 'update_record')).toBe(true);
  });
  it('send_email is not', () => {
    expect(isRollbackable(BUILTIN_ACTION_CATALOG, 'send_email')).toBe(false);
  });
});

describe('automation-action-catalog.merge / cap / serialize / summarize', () => {
  it('merge', () => {
    const ext: IActionCatalog = {
      version: 2,
      defaultType: 'ai_prompt',
      types: [{ ...BUILTIN_ACTION_CATALOG.types[0], label: 'X' }],
    };
    const m = mergeActionCatalogs(BUILTIN_ACTION_CATALOG, ext);
    expect(m.defaultType).toBe('ai_prompt');
  });
  it('cap', () => {
    const big: IActionCatalog = {
      version: 1,
      defaultType: 'x',
      types: Array.from({ length: 80 }, (_, i) => ({
        type: `a${i}`,
        label: `A${i}`,
        category: 'system',
        description: '',
        icon: '',
        fields: [],
        rollback: false,
      })),
    };
    expect(capActionCatalog(big).types.length).toBe(64);
  });
  it('serialize', () => {
    expect(serializeActionCatalog(BUILTIN_ACTION_CATALOG).length).toBeGreaterThan(0);
  });
  it('summarize', () => {
    const s = summarizeActionCatalog(BUILTIN_ACTION_CATALOG);
    expect(s.count).toBe(6);
    expect(s.rollbackable).toBe(1);
  });
});
