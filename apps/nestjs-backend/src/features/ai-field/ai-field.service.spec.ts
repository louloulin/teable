/* eslint-disable @typescript-eslint/naming-convention */
import {
  buildAiFieldRow,
  buildDefaultPrompt,
  buildRunRow,
  buildTemplateRow,
  estimateTokens,
  foldRuns,
  guardOutput,
  hashConfig,
  isValidModel,
  isValidOperation,
  isValidStatusTransition,
  parseConfig,
  parseSourceFieldIds,
  renderPrompt,
  stringifyConfig,
  validateConfig,
} from './ai-field.service';

describe('AI Field helpers (Stage 31)', () => {
  describe('validators', () => {
    it('isValidOperation', () => {
      expect(isValidOperation('classify')).toBe(true);
      expect(isValidOperation('translate')).toBe(true);
      expect(isValidOperation('image')).toBe(true);
      expect(isValidOperation('custom')).toBe(true);
      expect(isValidOperation('embed')).toBe(false);
    });

    it('isValidModel', () => {
      expect(isValidModel('gpt-4o-mini')).toBe(true);
      expect(isValidModel('claude-haiku-4-5-20251001')).toBe(true);
      expect(isValidModel('gpt-9')).toBe(false);
    });

    it('isValidStatusTransition', () => {
      expect(isValidStatusTransition('enabled', 'paused')).toBe(true);
      expect(isValidStatusTransition('enabled', 'enabled')).toBe(false);
      expect(isValidStatusTransition('error', 'enabled')).toBe(true);
    });

    it('validateConfig rejects empty classify labels', () => {
      expect(() => validateConfig('classify', { labels: [] })).toThrow();
    });

    it('validateConfig rejects duplicate classify labels', () => {
      expect(() => validateConfig('classify', { labels: ['a', 'a'] })).toThrow();
    });

    it('validateConfig rejects invalid summarize style', () => {
      expect(() => validateConfig('summarize', { style: 'rambling' as never })).toThrow();
    });

    it('validateConfig rejects translate without targetLang', () => {
      expect(() => validateConfig('translate', { targetLang: '' })).toThrow();
    });

    it('validateConfig accepts a valid score range', () => {
      expect(() => validateConfig('score', { min: 1, max: 5, criteria: 'clarity' })).not.toThrow();
    });

    it('validateConfig rejects non-integer score bounds', () => {
      expect(() => validateConfig('score', { min: 1.5, max: 5 })).toThrow();
    });

    it('validateConfig rejects inverted score range', () => {
      expect(() => validateConfig('score', { min: 5, max: 1 })).toThrow();
    });

    it('validateConfig accepts a valid image config', () => {
      expect(() =>
        validateConfig('image', { prompt: 'a red circle', size: '1024x1024', count: 1 })
      ).not.toThrow();
    });

    it('validateConfig rejects image without prompt', () => {
      expect(() => validateConfig('image', { prompt: '  ' })).toThrow();
    });

    it('validateConfig rejects image with invalid count', () => {
      expect(() => validateConfig('image', { prompt: 'x', count: 0 })).toThrow();
      expect(() => validateConfig('image', { prompt: 'x', count: 5 })).toThrow();
    });

    it('validateConfig rejects image with invalid quality', () => {
      expect(() => validateConfig('image', { prompt: 'x', quality: 'ultra' as never })).toThrow();
    });

    it('validateConfig accepts a valid custom prompt', () => {
      expect(() =>
        validateConfig('custom', { prompt: 'Rewrite {{Name}} in a friendly tone' })
      ).not.toThrow();
    });

    it('validateConfig rejects custom prompt without prompt', () => {
      expect(() => validateConfig('custom', { prompt: '  ' })).toThrow();
    });

    it('validateConfig rejects custom with invalid language', () => {
      expect(() =>
        validateConfig('custom', { prompt: 'x', language: 'klingon' as never })
      ).toThrow();
    });

    it('validateConfig rejects out-of-range score bounds', () => {
      expect(() => validateConfig('score', { min: 0, max: 10001 })).toThrow();
    });
  });

  describe('config hashing + JSON', () => {
    it('hashConfig is order-independent', () => {
      const a = hashConfig({ targetLang: 'zh', sourceLang: 'en' });
      const b = hashConfig({ sourceLang: 'en', targetLang: 'zh' });
      expect(a).toBe(b);
    });

    it('stringifyConfig sorts labels', () => {
      expect(stringifyConfig({ labels: ['c', 'a', 'b'] })).toBe('{"labels":["a","b","c"]}');
    });

    it('parseConfig roundtrips', () => {
      const s = stringifyConfig({ labels: ['a', 'b'] });
      expect(parseConfig(s)).toEqual({ labels: ['a', 'b'] });
    });
  });

  describe('estimateTokens / renderPrompt', () => {
    it('estimateTokens uses 4-char heuristic', () => {
      expect(estimateTokens('abcd')).toBe(1);
      expect(estimateTokens('abcde')).toBe(2);
      expect(estimateTokens('')).toBe(0);
    });

    it('renderPrompt substitutes {{var}}', () => {
      const out = renderPrompt({ template: 'Hi {{name}}!', variables: { name: 'alice' } });
      expect(out).toBe('Hi alice!');
    });

    it('renderPrompt handles missing variable as empty', () => {
      const out = renderPrompt({ template: '{{a}}-{{b}}', variables: { a: 'x' } });
      expect(out).toBe('x-');
    });
  });

  describe('buildDefaultPrompt', () => {
    it('classify renders labels', () => {
      const p = buildDefaultPrompt(
        'classify',
        'english',
        { labels: ['bug', 'feature'] },
        'My report'
      );
      expect(p).toContain('bug, feature');
      expect(p).toContain('My report');
    });

    it('summarize fills maxLength + style', () => {
      const p = buildDefaultPrompt(
        'summarize',
        'english',
        { maxLength: 50, style: 'concise' },
        'long text'
      );
      expect(p).toContain('50');
      expect(p).toContain('concise');
    });

    it('translate fills targetLang', () => {
      const p = buildDefaultPrompt('translate', 'english', { targetLang: 'fr' }, 'hello');
      expect(p).toContain('fr');
    });

    it('score fills min/max/criteria', () => {
      const p = buildDefaultPrompt(
        'score',
        'english',
        { min: 1, max: 5, criteria: 'Rate clarity only.' },
        'draft text'
      );
      expect(p).toContain('1');
      expect(p).toContain('5');
      expect(p).toContain('Rate clarity only.');
      expect(p).toContain('draft text');
    });

    it('falls back to english for unknown language', () => {
      const p = buildDefaultPrompt('translate', 'klingon', { targetLang: 'tlh' }, 'hello');
      expect(p).toContain('tlh');
    });
  });

  describe('buildAiFieldRow / parseSourceFieldIds', () => {
    it('buildAiFieldRow sets defaults', () => {
      const r = buildAiFieldRow({
        id: 'a',
        baseId: 'b',
        tableId: 't',
        fieldId: 'f',
        operation: 'classify',
        model: 'gpt-4o-mini',
        sourceFieldIds: ['fld_1'],
        config: { labels: ['a', 'b'] },
        createdBy: 'u',
      });
      expect(r.status).toBe('enabled');
      expect(r.sourceFieldIds).toBe('fld_1');
      expect(r.configHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('parseSourceFieldIds splits csv', () => {
      expect(parseSourceFieldIds('a,b ,c')).toEqual(['a', 'b', 'c']);
    });
  });

  describe('guardOutput', () => {
    it('classify picks known label', () => {
      const out = guardOutput({
        operation: 'classify',
        config: { labels: ['bug', 'feature'] },
        rawOutput: 'this looks like a bug to me',
      });
      expect(out).toBe('bug');
    });

    it('classify falls back to first label when no match', () => {
      const out = guardOutput({
        operation: 'classify',
        config: { labels: ['bug', 'feature'] },
        rawOutput: 'unrelated',
      });
      expect(out).toBe('bug');
    });

    it('summarize truncates to maxLength', () => {
      const longText = 'word '.repeat(100);
      const out = guardOutput({
        operation: 'summarize',
        config: { maxLength: 30 },
        rawOutput: longText,
      });
      expect(out.length).toBeLessThanOrEqual(30);
      expect(out.endsWith('…')).toBe(true);
    });

    it('translate trims only', () => {
      expect(
        guardOutput({
          operation: 'translate',
          config: { targetLang: 'fr' },
          rawOutput: '  bonjour  ',
        })
      ).toBe('bonjour');
    });

    it('score clamps an out-of-range numeric output', () => {
      expect(
        guardOutput({ operation: 'score', config: { min: 1, max: 5 }, rawOutput: '9' })
      ).toBe('5');
      expect(
        guardOutput({ operation: 'score', config: { min: 1, max: 5 }, rawOutput: '0' })
      ).toBe('1');
    });

    it('score rounds fractional output to an integer', () => {
      expect(
        guardOutput({ operation: 'score', config: { min: 1, max: 5 }, rawOutput: '3.6' })
      ).toBe('4');
    });

    it('score falls back to min when output is not numeric', () => {
      expect(
        guardOutput({ operation: 'score', config: { min: 1, max: 5 }, rawOutput: 'excellent' })
      ).toBe('1');
    });
  });

  describe('foldRuns', () => {
    it('aggregates counts + tokens + duration', () => {
      const agg = foldRuns([
        { status: 'ok', promptTokens: 10, completionTokens: 5, durationMs: 100 },
        { status: 'ok', promptTokens: 12, completionTokens: 6, durationMs: 200 },
        { status: 'failed', promptTokens: 8, completionTokens: 0, durationMs: 50 },
        { status: 'rate-limited', promptTokens: 0, completionTokens: 0, durationMs: 0 },
      ]);
      expect(agg.total).toBe(4);
      expect(agg.byStatus).toEqual({ ok: 2, failed: 1, 'rate-limited': 1, skipped: 0 });
      expect(agg.promptTokens).toBe(30);
      expect(agg.completionTokens).toBe(11);
      expect(agg.totalDurationMs).toBe(350);
      expect(agg.averageDurationMs).toBe(88);
    });

    it('empty → zero agg', () => {
      const agg = foldRuns([]);
      expect(agg.total).toBe(0);
      expect(agg.averageDurationMs).toBe(0);
    });
  });

  describe('buildRunRow / buildTemplateRow', () => {
    it('buildRunRow computes durationMs from timestamps', () => {
      const startedAt = new Date('2026-08-25T00:00:00Z');
      const finishedAt = new Date('2026-08-25T00:00:01Z');
      const r = buildRunRow({
        id: 'r',
        aiFieldId: 'a',
        recordId: 'rec',
        inputText: 'hello',
        model: 'gpt-4o-mini',
        outputText: 'hi',
        startedAt,
        finishedAt,
      });
      expect(r.durationMs).toBe(1000);
      expect(r.promptTokens).toBe(2);
    });

    it('buildTemplateRow defaults language', () => {
      const r = buildTemplateRow({
        id: 't',
        operation: 'classify',
        name: 'default',
        promptTemplate: '...',
        createdBy: 'u',
      });
      expect(r.language).toBe('english');
    });
  });
});
