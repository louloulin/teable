/* eslint-disable @typescript-eslint/naming-convention */
import {
  applyPolicies,
  applyPolicy,
  applyStrategy,
  isValidRole,
  isValidScope,
  isValidStrategy,
  validateCreateInput,
  validatePartialRule,
  validateRegexRule,
  viewerMaySee,
} from './data-masking.service';
import {
  DEFAULT_PARTIAL_KEEP_PREFIX,
  DEFAULT_PARTIAL_KEEP_SUFFIX,
  DEFAULT_PARTIAL_MASK,
  HASH_PREFIX,
} from './data-masking.types';
import type { IMaskingPolicy } from './data-masking.types';

function mkPolicy(over: Partial<IMaskingPolicy> = {}): IMaskingPolicy {
  return {
    id: 'mp_test',
    baseId: 'b1',
    tableId: 't1',
    fieldId: 'f1',
    strategy: 'full-redact',
    scope: 'all',
    allowedRoles: [],
    createdTime: new Date(),
    updatedTime: new Date(),
    ...over,
  };
}

describe('data-masking.validators', () => {
  describe('isValidStrategy', () => {
    it('accepts all 7 strategies', () => {
      expect(isValidStrategy('full-redact')).toBe(true);
      expect(isValidStrategy('partial')).toBe(true);
      expect(isValidStrategy('regex')).toBe(true);
      expect(isValidStrategy('hash')).toBe(true);
      expect(isValidStrategy('keep-last')).toBe(true);
      expect(isValidStrategy('email-local')).toBe(true);
      expect(isValidStrategy('phone-tail')).toBe(true);
    });

    it('rejects unknown', () => {
      expect(isValidStrategy('totally-bogus')).toBe(false);
      expect(isValidStrategy('')).toBe(false);
    });
  });

  describe('isValidScope', () => {
    it('accepts all/role-based/field-based', () => {
      expect(isValidScope('all')).toBe(true);
      expect(isValidScope('role-based')).toBe(true);
      expect(isValidScope('field-based')).toBe(true);
    });

    it('rejects unknown', () => {
      expect(isValidScope('random')).toBe(false);
    });
  });

  describe('isValidRole', () => {
    it('accepts admin/editor/viewer/guest/custom', () => {
      for (const r of ['owner', 'creator', 'editor', 'commenter', 'viewer']) {
        expect(isValidRole(r)).toBe(true);
      }
    });

    it('rejects unknown', () => {
      expect(isValidRole('superuser')).toBe(false);
    });
  });

  describe('validateCreateInput', () => {
    it('passes a minimal valid policy', () => {
      expect(() =>
        validateCreateInput({
          baseId: 'b1',
          tableId: 't1',
          fieldId: 'f1',
          strategy: 'full-redact',
          scope: 'all',
        })
      ).not.toThrow();
    });

    it('rejects invalid strategy', () => {
      expect(() =>
        validateCreateInput({
          baseId: 'b1',
          tableId: 't1',
          fieldId: 'f1',
          strategy: 'wat',
          scope: 'all',
        } as never)
      ).toThrow(/strategy/);
    });

    it('rejects invalid scope', () => {
      expect(() =>
        validateCreateInput({
          baseId: 'b1',
          tableId: 't1',
          fieldId: 'f1',
          strategy: 'full-redact',
          scope: 'random',
        } as never)
      ).toThrow(/scope/);
    });

    it('requires baseId/tableId/fieldId', () => {
      expect(() =>
        validateCreateInput({
          baseId: '',
          tableId: 't1',
          fieldId: 'f1',
          strategy: 'full-redact',
          scope: 'all',
        })
      ).toThrow();
      expect(() =>
        validateCreateInput({
          baseId: 'b1',
          tableId: '',
          fieldId: 'f1',
          strategy: 'full-redact',
          scope: 'all',
        })
      ).toThrow();
      expect(() =>
        validateCreateInput({
          baseId: 'b1',
          tableId: 't1',
          fieldId: '',
          strategy: 'full-redact',
          scope: 'all',
        })
      ).toThrow();
    });

    it('role-based requires allowedRoles', () => {
      expect(() =>
        validateCreateInput({
          baseId: 'b1',
          tableId: 't1',
          fieldId: 'f1',
          strategy: 'full-redact',
          scope: 'role-based',
        })
      ).toThrow(/allowedRoles/);

      expect(() =>
        validateCreateInput({
          baseId: 'b1',
          tableId: 't1',
          fieldId: 'f1',
          strategy: 'full-redact',
          scope: 'role-based',
          allowedRoles: ['owner', 'wat'] as never,
        })
      ).toThrow(/role/);
    });

    it('partial strategy requires partial rule', () => {
      expect(() =>
        validateCreateInput({
          baseId: 'b1',
          tableId: 't1',
          fieldId: 'f1',
          strategy: 'partial',
          scope: 'all',
        })
      ).toThrow(/partial rule/);
    });

    it('regex strategy requires regexRules', () => {
      expect(() =>
        validateCreateInput({
          baseId: 'b1',
          tableId: 't1',
          fieldId: 'f1',
          strategy: 'regex',
          scope: 'all',
        })
      ).toThrow(/regexRules/);
    });
  });

  describe('validatePartialRule', () => {
    it('rejects negative keepPrefix', () => {
      expect(() => validatePartialRule({ keepPrefix: -1, keepSuffix: 2, mask: '*' })).toThrow();
    });

    it('rejects negative keepSuffix', () => {
      expect(() => validatePartialRule({ keepPrefix: 2, keepSuffix: -1, mask: '*' })).toThrow();
    });

    it('rejects empty mask', () => {
      expect(() => validatePartialRule({ keepPrefix: 2, keepSuffix: 2, mask: '' })).toThrow();
    });

    it('accepts zero values', () => {
      expect(() => validatePartialRule({ keepPrefix: 0, keepSuffix: 0, mask: '*' })).not.toThrow();
    });
  });

  describe('validateRegexRule', () => {
    it('requires a pattern', () => {
      expect(() => validateRegexRule({ pattern: '', replacement: 'X' })).toThrow();
    });

    it('throws on invalid regex syntax', () => {
      expect(() => validateRegexRule({ pattern: '[unclosed', replacement: 'X' })).toThrow();
    });

    it('accepts a valid pattern', () => {
      expect(() => validateRegexRule({ pattern: '\\d+', replacement: '#' })).not.toThrow();
    });
  });
});

describe('data-masking.applyStrategy', () => {
  it('full-redact masks with stars up to 8 chars', () => {
    const r = applyStrategy(mkPolicy({ strategy: 'full-redact' }), 'hello');
    expect(r).toBe('*****');
    const r2 = applyStrategy(mkPolicy({ strategy: 'full-redact' }), 'a-very-long-string');
    expect(r2).toBe('********');
  });

  it('full-redact handles empty string', () => {
    expect(applyStrategy(mkPolicy({ strategy: 'full-redact' }), '')).toBe('');
  });

  it('partial with custom rule keeps prefix/suffix', () => {
    const r = applyStrategy(
      mkPolicy({
        strategy: 'partial',
        partial: { keepPrefix: 1, keepSuffix: 1, mask: '*' },
      }),
      'abcdef'
    );
    expect(r).toBe('a****f');
  });

  it('partial falls back to defaults', () => {
    const r = applyStrategy(mkPolicy({ strategy: 'partial' }), 'abcdef');
    expect(r).toBe('ab**ef');
  });

  it('partial collapses very short strings to full mask', () => {
    const r = applyStrategy(mkPolicy({ strategy: 'partial' }), 'abc');
    expect(r).toBe('***');
  });

  it('partial default constants match', () => {
    expect(DEFAULT_PARTIAL_KEEP_PREFIX).toBe(2);
    expect(DEFAULT_PARTIAL_KEEP_SUFFIX).toBe(2);
    expect(DEFAULT_PARTIAL_MASK).toBe('*');
  });

  it('regex applies each rule in order', () => {
    const r = applyStrategy(
      mkPolicy({
        strategy: 'regex',
        regexRules: [
          { pattern: '\\d', replacement: '#' },
          { pattern: '#+', replacement: 'X' },
        ],
      }),
      'foo123bar'
    );
    expect(r).toBe('fooXbar');
  });

  it('hash produces a stable, prefixed value', () => {
    const a = applyStrategy(mkPolicy({ strategy: 'hash' }), 'hello');
    const b = applyStrategy(mkPolicy({ strategy: 'hash' }), 'hello');
    expect(a).toBe(b);
    expect(String(a).startsWith(HASH_PREFIX)).toBe(true);
    expect(HASH_PREFIX).toBe('h:');
  });

  it('hash differs for different inputs', () => {
    const a = applyStrategy(mkPolicy({ strategy: 'hash' }), 'foo');
    const b = applyStrategy(mkPolicy({ strategy: 'hash' }), 'bar');
    expect(a).not.toBe(b);
  });

  it('keep-last reveals the last 4 chars', () => {
    expect(applyStrategy(mkPolicy({ strategy: 'keep-last' }), '12345678')).toBe('****5678');
  });

  it('keep-last on a short string masks it all', () => {
    expect(applyStrategy(mkPolicy({ strategy: 'keep-last' }), 'ab')).toBe('**');
  });

  it('email-local masks the local part, keeps domain', () => {
    expect(applyStrategy(mkPolicy({ strategy: 'email-local' }), 'alice@example.com')).toBe(
      'a***e@example.com'
    );
  });

  it('email-local falls back to full mask on no @', () => {
    expect(applyStrategy(mkPolicy({ strategy: 'email-local' }), 'plainstring')).toBe('********');
  });

  it('email-local with 1-char local part', () => {
    expect(applyStrategy(mkPolicy({ strategy: 'email-local' }), 'a@x.com')).toBe('**@x.com');
  });

  it('phone-tail reveals last 4 digits', () => {
    expect(applyStrategy(mkPolicy({ strategy: 'phone-tail' }), '555-123-4567')).toBe(
      '***-***-4567'
    );
  });

  it('phone-tail strips non-digits first', () => {
    expect(applyStrategy(mkPolicy({ strategy: 'phone-tail' }), '+1 (555) 123-4567')).toBe(
      '***-***-4567'
    );
  });

  it('phone-tail on too-short string falls back', () => {
    expect(applyStrategy(mkPolicy({ strategy: 'phone-tail' }), '12')).toBe('**');
  });

  it('returns null/undefined unchanged', () => {
    const p = mkPolicy({ strategy: 'full-redact' });
    expect(applyStrategy(p, null)).toBeNull();
    expect(applyStrategy(p, undefined)).toBeUndefined();
  });
});

describe('data-masking.applyPolicy', () => {
  it('masks when scope is all', () => {
    const p = mkPolicy({ strategy: 'full-redact', scope: 'all' });
    const r = applyPolicy(p, 'secret', 'viewer');
    expect(r.masked).toBe(true);
    expect(r.value).toBe('******');
  });

  it('does not mask when role is in allowedRoles', () => {
    const p = mkPolicy({
      strategy: 'full-redact',
      scope: 'role-based',
      allowedRoles: ['owner'],
    });
    const r = applyPolicy(p, 'secret', 'owner');
    expect(r.masked).toBe(false);
    expect(r.value).toBe('secret');
  });

  it('masks when role is NOT in allowedRoles', () => {
    const p = mkPolicy({
      strategy: 'full-redact',
      scope: 'role-based',
      allowedRoles: ['owner'],
    });
    const r = applyPolicy(p, 'secret', 'viewer');
    expect(r.masked).toBe(true);
    expect(r.value).toBe('******');
  });
});

describe('data-masking.applyPolicies', () => {
  it('applies policies only to present fieldIds', () => {
    const p = mkPolicy({ fieldId: 'phone', strategy: 'phone-tail' });
    const out = applyPolicies([p], { phone: '555-123-4567', name: 'Alice' }, 'viewer');
    expect(out['phone']).toBe('***-***-4567');
    expect(out['name']).toBe('Alice');
  });

  it('skips policies with missing fieldId', () => {
    const p = mkPolicy({ fieldId: 'absent', strategy: 'full-redact' });
    const out = applyPolicies([p], { name: 'Alice' }, 'viewer');
    expect(out).toEqual({ name: 'Alice' });
  });

  it('handles empty policies list', () => {
    expect(applyPolicies([], { foo: 'bar' }, 'viewer')).toEqual({ foo: 'bar' });
  });
});

describe('data-masking.viewerMaySee', () => {
  it('returns false for all scope', () => {
    expect(viewerMaySee(mkPolicy({ scope: 'all' }), 'owner')).toBe(false);
  });

  it('returns true for role-based + matching role', () => {
    const p = mkPolicy({ scope: 'role-based', allowedRoles: ['editor'] });
    expect(viewerMaySee(p, 'editor')).toBe(true);
    expect(viewerMaySee(p, 'viewer')).toBe(false);
  });

  it('returns false for field-based scope (per-viewer rules)', () => {
    expect(viewerMaySee(mkPolicy({ scope: 'field-based' }), 'owner')).toBe(false);
  });
});
