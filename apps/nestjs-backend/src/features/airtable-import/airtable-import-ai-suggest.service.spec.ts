/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-MIGRATE: AI-assisted mapping suggestions — unit tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AirtableImportAiSuggestService,
  type ISourceField,
  type ITargetField,
} from './airtable-import-ai-suggest.service';

function buildResolverStub() {
  return {
    resolve: vi.fn(() => ({
      source: 'matrix' as const,
      config: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        baseUrl: 'https://api.openai.com/v1',
        contextWindow: 128_000,
        supportsTools: true,
        supportsVision: true,
      },
    })),
  };
}

function makeSvc() {
  const resolver = buildResolverStub();
  const svc = new AirtableImportAiSuggestService(resolver as never);
  return { svc, resolver };
}

describe('AirtableImportAiSuggestService (R-MIGRATE)', () => {
  let svc: AirtableImportAiSuggestService;
  let resolver: ReturnType<typeof buildResolverStub>;

  beforeEach(() => {
    ({ svc, resolver } = makeSvc());
    vi.clearAllMocks();
  });

  it('returns resolver config so UI can show "Powered by <model>"', () => {
    const result = svc.suggest([], []);
    expect(result.model.model).toBe('gpt-4o-mini');
    expect(result.model.provider).toBe('openai');
    expect(result.modelSource).toBe('matrix');
    expect(resolver.resolve).toHaveBeenCalledWith({ capability: 'chat', provider: 'openai' });
  });

  it('matches exact name (case + punctuation insensitive)', () => {
    const sources: ISourceField[] = [
      { name: 'Email Address', sourceType: 'email' },
      { name: 'First Name', sourceType: 'singleLineText' },
    ];
    const targets: ITargetField[] = [
      { id: 't1', name: 'first_name', type: 'singleLineText' },
      { id: 't2', name: 'email_address', type: 'email' },
    ];
    const result = svc.suggest(sources, targets);
    expect(result.suggestions[0].targetFieldId).toBe('t2'); // Email Address → email_address
    expect(result.suggestions[0].confidence).toBe(1.0);
    expect(result.suggestions[1].targetFieldId).toBe('t1');
    expect(result.stats.matched).toBe(2);
  });

  it('falls back to type-compatibility when names do not match', () => {
    const sources: ISourceField[] = [{ name: 'Customer Score', sourceType: 'number' }];
    const targets: ITargetField[] = [{ id: 't1', name: 'rating_value', type: 'rating' }];
    const result = svc.suggest(sources, targets);
    expect(result.suggestions[0].targetFieldId).toBe('t1');
    expect(result.suggestions[0].confidence).toBeGreaterThanOrEqual(0.4);
    expect(result.suggestions[0].reason).toContain('type');
  });

  it('marks unmatched as llm-deferred with null target', () => {
    const sources: ISourceField[] = [{ name: 'Mystery', sourceType: 'formula' }];
    const targets: ITargetField[] = [{ id: 't1', name: 'count', type: 'number' }];
    const result = svc.suggest(sources, targets);
    expect(result.suggestions[0].targetFieldId).toBeNull();
    expect(result.suggestions[0].source).toBe('llm-deferred');
    expect(result.stats.unmatched).toBe(1);
  });

  it('does not assign the same target twice (usedTargets tracking)', () => {
    const sources: ISourceField[] = [
      { name: 'name', sourceType: 'singleLineText' },
      { name: 'name', sourceType: 'singleLineText' },
    ];
    const targets: ITargetField[] = [
      { id: 't1', name: 'name', type: 'singleLineText' },
    ];
    const result = svc.suggest(sources, targets);
    expect(result.suggestions[0].targetFieldId).toBe('t1');
    expect(result.suggestions[1].targetFieldId).toBeNull();
    expect(result.stats.matched).toBe(1);
  });

  it('handles chinese field names via normalize', () => {
    const sources: ISourceField[] = [{ name: '客户姓名', sourceType: 'singleLineText' }];
    const targets: ITargetField[] = [{ id: 't1', name: '客户姓名', type: 'singleLineText' }];
    const result = svc.suggest(sources, targets);
    expect(result.suggestions[0].targetFieldId).toBe('t1');
    expect(result.suggestions[0].confidence).toBe(1.0);
  });

  it('computes avgConfidence correctly', () => {
    const sources: ISourceField[] = [
      { name: 'Name', sourceType: 'singleLineText' }, // 1.0
      { name: 'Score', sourceType: 'number' },        // type-only 0.4
    ];
    const targets: ITargetField[] = [
      { id: 't1', name: 'Name', type: 'singleLineText' },
      { id: 't2', name: 'Rating', type: 'rating' },
    ];
    const result = svc.suggest(sources, targets);
    expect(result.stats.matched).toBe(2);
    expect(result.stats.avgConfidence).toBeCloseTo((1.0 + 0.4) / 2, 5);
  });
});
