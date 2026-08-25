import {
  aggregateOrgUsage,
  buildUsageRow,
  canRegisterMore,
  computeHealth,
  fingerprintKey,
  hashAttempt,
  normalizeProviderKey,
  routeRequest,
  shouldMarkExhausted,
  suggestAlias,
  validateProviderKey,
} from './byok-llm.service';
import type { ILlmProviderKey } from './byok-llm.types';

const baseKey = (over: Partial<ILlmProviderKey> = {}): ILlmProviderKey => ({
  id: 'k1',
  orgId: 'org1',
  provider: 'openai',
  alias: 'openai-primary',
  status: 'active',
  ciphertextRef: 'cipher:abc',
  fingerprint: 'abcd',
  verifiedAt: null,
  lastUsedAt: null,
  providerTpmCap: 0,
  orgDailyCap: 0,
  isolation: 'exclusive',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('byok-llm.fingerprintKey', () => {
  it('returns the last 4 chars for long keys', () => {
    expect(fingerprintKey('sk-abcdef1234ghijkl')).toBe('ijkl');
  });
  it('returns the input unchanged for short keys', () => {
    expect(fingerprintKey('abcd')).toBe('abcd');
  });
  it('returns empty string for empty input', () => {
    expect(fingerprintKey('')).toBe('');
  });
});

describe('byok-llm.suggestAlias', () => {
  it('slugifies the friendly name', () => {
    expect(suggestAlias({ provider: 'openai', friendlyName: 'My Key!' })).toBe('openai-my-key');
  });
  it('falls back to "key" for empty names', () => {
    expect(suggestAlias({ provider: 'anthropic', friendlyName: '' })).toBe('anthropic-key');
  });
});

describe('byok-llm.validateProviderKey', () => {
  it('passes a healthy key', () => {
    expect(validateProviderKey(baseKey())).toEqual([]);
  });
  it('flags unknown provider', () => {
    expect(
      validateProviderKey(baseKey({ provider: 'gpt9' as ILlmProviderKey['provider'] })).join(' ')
    ).toContain('unknown provider');
  });
  it('flags missing alias and ciphertextRef', () => {
    const errs = validateProviderKey(baseKey({ alias: '', ciphertextRef: '' }));
    expect(errs.join(' ')).toContain('alias');
    expect(errs.join(' ')).toContain('ciphertextRef');
  });
  it('flags negative caps', () => {
    expect(
      validateProviderKey(baseKey({ providerTpmCap: -1, orgDailyCap: -1 })).join(' ')
    ).toContain('providerTpmCap');
  });
});

describe('byok-llm.normalizeProviderKey', () => {
  it('fills defaults', () => {
    const k = normalizeProviderKey({ id: 'k', orgId: 'o', provider: 'openai' });
    expect(k.status).toBe('active');
    expect(k.isolation).toBe('exclusive');
    expect(typeof k.createdAt).toBe('string');
  });
});

describe('byok-llm.canRegisterMore', () => {
  it('allows under the cap', () => {
    expect(canRegisterMore(0)).toBe(true);
    expect(canRegisterMore(31)).toBe(true);
  });
  it('blocks at the cap', () => {
    expect(canRegisterMore(32)).toBe(false);
  });
});

describe('byok-llm.buildUsageRow', () => {
  it('aggregates attempts in the day', () => {
    const row = buildUsageRow({
      orgId: 'o',
      keyId: 'k',
      provider: 'openai',
      day: '2026-01-01',
      attempts: [
        {
          orgId: 'o',
          keyId: 'k',
          provider: 'openai',
          tokens: 100,
          costCents: 5,
          succeeded: true,
          atIso: '2026-01-01T00:00:00Z',
        },
        {
          orgId: 'o',
          keyId: 'k',
          provider: 'openai',
          tokens: 200,
          costCents: 10,
          succeeded: false,
          atIso: '2026-01-01T00:01:00Z',
        },
        {
          orgId: 'o',
          keyId: 'k',
          provider: 'openai',
          tokens: 999,
          costCents: 99,
          succeeded: true,
          atIso: '2026-01-02T00:00:00Z',
        },
      ],
    });
    expect(row.tokens).toBe(300);
    expect(row.requests).toBe(2);
    expect(row.errors).toBe(1);
    expect(row.costCents).toBe(15);
  });
});

describe('byok-llm.aggregateOrgUsage', () => {
  it('sums multiple rows', () => {
    const rows = [
      { ...baseRow(), tokens: 100, costCents: 5, requests: 1, errors: 0 },
      { ...baseRow(), tokens: 50, costCents: 2, requests: 1, errors: 1 },
    ];
    const total = aggregateOrgUsage(rows);
    expect(total.tokens).toBe(150);
    expect(total.costCents).toBe(7);
    expect(total.requests).toBe(2);
    expect(total.errors).toBe(1);
  });
  it('returns zeros for empty input', () => {
    const total = aggregateOrgUsage([]);
    expect(total.tokens).toBe(0);
  });
});

function baseRow() {
  return {
    orgId: 'o',
    keyId: 'k',
    provider: 'openai' as const,
    day: '2026-01-01',
    tokens: 0,
    costCents: 0,
    requests: 0,
    errors: 0,
  };
}

describe('byok-llm.computeHealth', () => {
  it('flips to invalid when success rate < 0.5', () => {
    const attempts = Array.from({ length: 10 }, (_, i) => ({
      orgId: 'o',
      keyId: 'k',
      provider: 'openai' as const,
      tokens: 1,
      costCents: 0,
      succeeded: i < 3,
      atIso: new Date(Date.now() - 1_000).toISOString(),
    }));
    const h = computeHealth({ keyId: 'k', provider: 'openai', attempts });
    expect(h.status).toBe('invalid');
  });
  it('reports active when all succeed', () => {
    const attempts = Array.from({ length: 10 }, () => ({
      orgId: 'o',
      keyId: 'k',
      provider: 'openai' as const,
      tokens: 1,
      costCents: 0,
      succeeded: true,
      atIso: new Date(Date.now() - 1_000).toISOString(),
    }));
    const h = computeHealth({ keyId: 'k', provider: 'openai', attempts });
    expect(h.status).toBe('active');
    expect(h.successRate1m).toBe(1);
  });
});

describe('byok-llm.routeRequest', () => {
  it('returns no-usable-key when keys are disabled', () => {
    const r = routeRequest({
      orgId: 'org1',
      keys: [baseKey({ status: 'disabled' })],
      usageByKey: {},
    });
    expect(r.keyId).toBeNull();
    expect(r.retry).toBe(true);
  });
  it('skips shared keys unless allowSharedFallback', () => {
    const r = routeRequest({
      orgId: 'org1',
      keys: [baseKey({ isolation: 'shared' })],
      usageByKey: {},
      options: { allowSharedFallback: false },
    });
    expect(r.keyId).toBeNull();
  });
  it('honours preferred order', () => {
    const a = baseKey({ id: 'a', provider: 'openai', alias: 'openai-a' });
    const b = baseKey({ id: 'b', provider: 'anthropic', alias: 'anthropic-b' });
    const r = routeRequest({
      orgId: 'org1',
      keys: [a, b],
      usageByKey: {},
      options: { preferred: ['anthropic'] },
    });
    expect(r.keyId).toBe('b');
  });
  it('skips keys whose daily cap is exhausted', () => {
    const k = baseKey({ id: 'k', orgDailyCap: 1000 });
    const r = routeRequest({
      orgId: 'org1',
      keys: [k],
      usageByKey: { k: { ...baseRow(), keyId: 'k', tokens: 1500 } },
    });
    expect(r.keyId).toBeNull();
  });
});

describe('byok-llm.hashAttempt', () => {
  it('is deterministic', () => {
    const a = {
      orgId: 'o',
      keyId: 'k',
      provider: 'openai' as const,
      tokens: 100,
      costCents: 5,
      succeeded: true,
      atIso: '2026-01-01T00:00:00Z',
    };
    expect(hashAttempt(a)).toBe(hashAttempt(a));
  });
  it('changes when inputs change', () => {
    const a = {
      orgId: 'o',
      keyId: 'k',
      provider: 'openai' as const,
      tokens: 100,
      costCents: 5,
      succeeded: true,
      atIso: '2026-01-01T00:00:00Z',
    };
    const b = { ...a, tokens: 101 };
    expect(hashAttempt(a)).not.toBe(hashAttempt(b));
  });
});

describe('byok-llm.shouldMarkExhausted', () => {
  it('returns true when usage meets the cap', () => {
    expect(
      shouldMarkExhausted({
        key: baseKey({ orgDailyCap: 1000 }),
        usage: { ...baseRow(), tokens: 1000 },
      })
    ).toBe(true);
  });
  it('returns false when below the cap', () => {
    expect(
      shouldMarkExhausted({
        key: baseKey({ orgDailyCap: 1000 }),
        usage: { ...baseRow(), tokens: 999 },
      })
    ).toBe(false);
  });
  it('returns false when cap is unlimited', () => {
    expect(
      shouldMarkExhausted({
        key: baseKey({ orgDailyCap: 0 }),
        usage: { ...baseRow(), tokens: 999_999 },
      })
    ).toBe(false);
  });
});
