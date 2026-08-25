/* eslint-disable @typescript-eslint/naming-convention */
import {
  buildBodyText,
  buildIndexRow,
  buildSnippet,
  buildTokenStream,
  contentHash,
  expandSynonyms,
  indexDocumentRowFromInput,
  isValidLanguage,
  isValidScope,
  isValidStatusTransition,
  runSearch,
  scoreDocument,
  stemApprox,
  tokenize,
} from './fulltext-search.service';

describe('Full-text Search helpers (Stage 42)', () => {
  describe('tokenize / stemApprox', () => {
    it('tokenize strips punctuation + stopwords', () => {
      expect(tokenize('The quick, brown fox jumps over the lazy dog!')).toEqual([
        'quick',
        'brown',
        'fox',
        'jumps',
        'lazy',
        'dog',
      ]);
    });

    it('stemApprox strips plurals', () => {
      expect(stemApprox('dogs')).toBe('dog');
      expect(stemApprox('boxes')).toBe('box');
      expect(stemApprox('categories')).toBe('category');
    });

    it('stemApprox leaves short words alone', () => {
      expect(stemApprox('a')).toBe('a');
      expect(stemApprox('the')).toBe('the');
    });
  });

  describe('buildBodyText / buildTokenStream / contentHash', () => {
    const fields = [
      { fieldId: 'title', value: 'Hello World' },
      { fieldId: 'body', value: 'This is a sample paragraph with multiple words.' },
      { fieldId: 'tags', value: null },
    ];

    it('buildBodyText joins non-empty fields', () => {
      expect(buildBodyText(fields)).toBe(
        'hello world\nthis is a sample paragraph with multiple words.'
      );
    });

    it('buildTokenStream dedupes', () => {
      const ts = buildTokenStream(fields);
      expect(ts).toContain('hello');
      expect(ts).toContain('world');
      const arr = ts.split(' ');
      expect(new Set(arr).size).toBe(arr.length);
    });

    it('contentHash is stable + order-independent', () => {
      const a = contentHash(fields);
      const b = contentHash([...fields].reverse());
      expect(a).toBe(b);
      expect(a).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('buildSnippet', () => {
    it('returns centered snippet with ellipsis', () => {
      const body = 'lorem ipsum dolor sit amet '.repeat(20);
      const snip = buildSnippet({ body, queryTerms: ['dolor'] });
      expect(snip).toContain('dolor');
      expect(snip.startsWith('…') || snip.endsWith('…')).toBe(true);
    });

    it('returns head when no match', () => {
      const body = 'hello world';
      const snip = buildSnippet({ body, queryTerms: ['xxx'] });
      expect(snip).toBe('hello world');
    });
  });

  describe('scoreDocument', () => {
    it('returns positive score on hit', () => {
      const s = scoreDocument({
        documentTokens: ['hello', 'world', 'foo'],
        documentBody: 'hello world foo',
        queryTokens: ['hello'],
        averageDocLength: 3,
        totalDocs: 5,
      });
      expect(s).toBeGreaterThan(0);
    });

    it('returns 0 on miss', () => {
      const s = scoreDocument({
        documentTokens: ['hello'],
        documentBody: 'hello',
        queryTokens: ['xxx'],
        averageDocLength: 1,
        totalDocs: 1,
      });
      expect(s).toBe(0);
    });
  });

  describe('expandSynonyms', () => {
    it('expands matching term to synonyms', () => {
      const syn = {
        id: 's',
        indexId: null,
        term: 'fast',
        synonymsCsv: 'quick,rapid',
        createdBy: 'u',
        createdTime: new Date(),
      };
      const expanded = expandSynonyms({ query: 'fast runner', synonyms: [syn] });
      expect(expanded).toContain('quick');
      expect(expanded).toContain('rapid');
    });

    it('no-op when term not in query', () => {
      const syn = {
        id: 's',
        indexId: null,
        term: 'fast',
        synonymsCsv: 'quick,rapid',
        createdBy: 'u',
        createdTime: new Date(),
      };
      const expanded = expandSynonyms({ query: 'slow runner', synonyms: [syn] });
      expect(expanded).toEqual(expect.arrayContaining(['slow', 'runner']));
      expect(expanded).not.toContain('quick');
    });
  });

  describe('validators + state machine', () => {
    it('isValidLanguage / isValidScope', () => {
      expect(isValidLanguage('english')).toBe(true);
      expect(isValidLanguage('klingon')).toBe(false);
      expect(isValidScope('row')).toBe(true);
      expect(isValidScope('posts')).toBe(false);
    });

    it('isValidStatusTransition', () => {
      expect(isValidStatusTransition('enabled', 'paused')).toBe(true);
      expect(isValidStatusTransition('paused', 'enabled')).toBe(true);
      expect(isValidStatusTransition('enabled', 'enabled')).toBe(false);
      expect(isValidStatusTransition('rebuild', 'paused')).toBe(true);
    });
  });

  describe('buildIndexRow / indexDocumentRowFromInput', () => {
    it('buildIndexRow defaults scope to row + status enabled', () => {
      const r = buildIndexRow({ id: 'i', baseId: 'b', tableId: 't', createdBy: 'u' });
      expect(r.scope).toBe('row');
      expect(r.status).toBe('enabled');
    });

    it('indexDocumentRowFromInput hashes consistently', () => {
      const a = indexDocumentRowFromInput({
        indexId: 'i',
        recordId: 'r',
        fields: [{ fieldId: 'k', value: 'v' }],
      });
      const b = indexDocumentRowFromInput({
        indexId: 'i',
        recordId: 'r',
        fields: [{ fieldId: 'k', value: 'v' }],
      });
      expect(a.contentHash).toBe(b.contentHash);
      expect(a.tokens.length).toBeGreaterThan(0);
    });
  });

  describe('runSearch', () => {
    it('returns ranked hits', () => {
      const result = runSearch({
        indexId: 'i',
        queryText: 'hello world',
        documents: [
          { recordId: 'r1', body: 'hello world', tokens: tokenize('hello world') },
          { recordId: 'r2', body: 'hello there', tokens: tokenize('hello there') },
          { recordId: 'r3', body: 'unrelated content', tokens: tokenize('unrelated content') },
        ],
      });
      expect(result.hits.length).toBe(2);
      expect(result.hits[0].recordId).toBe('r1');
      expect(result.total).toBe(2);
    });

    it('returns empty when no match', () => {
      const result = runSearch({
        indexId: 'i',
        queryText: 'alpha',
        documents: [{ recordId: 'r1', body: 'beta gamma', tokens: tokenize('beta gamma') }],
      });
      expect(result.hits).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('honors limit + offset', () => {
      const docs = Array.from({ length: 5 }, (_, i) => ({
        recordId: `r${i}`,
        body: 'hello',
        tokens: ['hello'],
      }));
      const r = runSearch({
        indexId: 'i',
        queryText: 'hello',
        documents: docs,
        limit: 2,
        offset: 1,
      });
      expect(r.hits).toHaveLength(2);
    });
  });
});
