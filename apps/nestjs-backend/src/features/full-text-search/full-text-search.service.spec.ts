/* eslint-disable @typescript-eslint/naming-convention */
import {
  buildBigrams,
  buildIndexedDocument,
  buildSearchQuery,
  filterTokens,
  findTokenOffset,
  normalizeQuery,
  normalizeScore,
  normalizeText,
  parseQueryString,
  scoreDocument,
  searchDocuments,
  shouldIndexField,
  tokenize,
  validateQuery,
} from './full-text-search.service';
import { DEFAULT_MATCH_MODE, DEFAULT_SORT } from './full-text-search.types';
import type { IIndexedDocument, ISearchQuery } from './full-text-search.types';

function mkDoc(text: string, over: Partial<IIndexedDocument> = {}): IIndexedDocument {
  return buildIndexedDocument({
    tableId: 'tbl',
    recordId: 'rec_1',
    fieldId: 'fld_1',
    text,
    ...over,
  });
}

describe('full-text-search.tokenize', () => {
  it('lowercases and strips punctuation', () => {
    expect(tokenize('Hello, WORLD!')).toEqual(['hello', 'world']);
  });

  it('keeps unicode letters and digits', () => {
    expect(tokenize('cafe 123 resume')).toEqual(['cafe', '123', 'resume']);
  });

  it('drops empty tokens', () => {
    expect(tokenize('   ---   ')).toEqual([]);
  });
});

describe('full-text-search.normalizeText', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalizeText('Café')).toBe('cafe');
  });
});

describe('full-text-search.filterTokens', () => {
  it('drops tokens shorter than min length', () => {
    expect(filterTokens(['a', 'bb', 'ccc'])).toEqual(['bb', 'ccc']);
  });

  it('drops tokens longer than max length', () => {
    const long = 'x'.repeat(200);
    expect(filterTokens([long])).toEqual([]);
  });
});

describe('full-text-search.bigrams', () => {
  it('returns adjacency bigrams', () => {
    expect(buildBigrams(['hello', 'world', 'foo'])).toEqual(['hello world', 'world foo']);
  });

  it('empty for short lists', () => {
    expect(buildBigrams([])).toEqual([]);
    expect(buildBigrams(['only'])).toEqual([]);
  });
});

describe('full-text-search.buildIndexedDocument', () => {
  it('counts tokens', () => {
    const doc = mkDoc('Hello world hello');
    expect(doc.tokens).toEqual(['hello', 'world', 'hello']);
    expect(doc.tokenCount).toBe(3);
    expect(doc.bigrams).toEqual(['hello world', 'world hello']);
  });

  it('indexedAt is a Date', () => {
    expect(mkDoc('x').indexedAt).toBeInstanceOf(Date);
  });
});

describe('full-text-search.parseQueryString', () => {
  it('extracts phrase tokens', () => {
    const toks = parseQueryString('foo "hello world" bar');
    expect(toks).toEqual([
      { value: 'foo', isPhrase: false, negate: false },
      { value: 'hello world', isPhrase: true },
      { value: 'bar', isPhrase: false, negate: false },
    ]);
  });

  it('handles negation', () => {
    const toks = parseQueryString('foo -bar');
    expect(toks).toEqual([
      { value: 'foo', isPhrase: false, negate: false },
      { value: 'bar', isPhrase: false, negate: true },
    ]);
  });

  it('ignores empty phrases', () => {
    expect(parseQueryString('""')).toEqual([]);
  });
});

describe('full-text-search.validateQuery', () => {
  const base: ISearchQuery = {
    tokens: [{ value: 'hello', isPhrase: false }],
    mode: 'and',
  };
  it('accepts a minimal query', () => {
    expect(() => validateQuery(base)).not.toThrow();
  });
  it('rejects empty tokens', () => {
    expect(() => validateQuery({ ...base, tokens: [] })).toThrow();
  });
  it('rejects bad mode', () => {
    expect(() => validateQuery({ ...base, mode: 'xor' as never })).toThrow();
  });
  it('rejects out-of-range limit', () => {
    expect(() => validateQuery({ ...base, limit: 0 })).toThrow();
    expect(() => validateQuery({ ...base, limit: 99999 })).toThrow();
  });
  it('rejects bad sort', () => {
    expect(() => validateQuery({ ...base, sort: 'oldest' as never })).toThrow();
  });
  it('rejects empty token values', () => {
    expect(() => validateQuery({ ...base, tokens: [{ value: '', isPhrase: false }] })).toThrow();
  });
  it('rejects long phrases', () => {
    const longPhrase = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
    expect(() =>
      validateQuery({ ...base, tokens: [{ value: longPhrase, isPhrase: true }] })
    ).toThrow();
  });
});

describe('full-text-search.normalizeQuery', () => {
  it('fills defaults', () => {
    const q = normalizeQuery({});
    expect(q.mode).toBe(DEFAULT_MATCH_MODE);
    expect(q.sort).toBe(DEFAULT_SORT);
    expect(q.tokens).toEqual([]);
  });
});

describe('full-text-search.scoreDocument', () => {
  const doc = mkDoc('hello world foo');

  it('matches single token in AND mode', () => {
    const r = scoreDocument(doc, { tokens: [{ value: 'hello', isPhrase: false }], mode: 'and' });
    expect(r?.score).toBe(2);
  });

  it('returns null when AND token missing', () => {
    expect(
      scoreDocument(doc, { tokens: [{ value: 'missing', isPhrase: false }], mode: 'and' })
    ).toBeNull();
  });

  it('matches phrase via bigrams', () => {
    const r = scoreDocument(doc, {
      tokens: [{ value: 'hello world', isPhrase: true }],
      mode: 'and',
    });
    expect(r?.score).toBe(5);
  });

  it('skips negated tokens that are absent', () => {
    const r = scoreDocument(doc, {
      tokens: [
        { value: 'hello', isPhrase: false },
        { value: 'spam', isPhrase: false, negate: true },
      ],
      mode: 'and',
    });
    expect(r?.matched).toContain('hello');
  });

  it('AND mode rejects when positive token missing', () => {
    expect(
      scoreDocument(doc, {
        tokens: [
          { value: 'hello', isPhrase: false },
          { value: 'spam', isPhrase: false },
        ],
        mode: 'and',
      })
    ).toBeNull();
  });

  it('OR mode allows partial match', () => {
    const r = scoreDocument(doc, {
      tokens: [
        { value: 'hello', isPhrase: false },
        { value: 'spam', isPhrase: false },
      ],
      mode: 'or',
    });
    expect(r).not.toBeNull();
  });
});

describe('full-text-search.normalizeScore', () => {
  it('caps at 1', () => {
    expect(normalizeScore(100, 2)).toBe(1);
  });
  it('zero token count yields 0', () => {
    expect(normalizeScore(5, 0)).toBe(0);
  });
});

describe('full-text-search.findTokenOffset', () => {
  it('returns first matched index', () => {
    const doc = mkDoc('hello world');
    expect(findTokenOffset(doc, ['world'])).toBe(1);
  });
  it('returns 0 when nothing matched', () => {
    const doc = mkDoc('hello');
    expect(findTokenOffset(doc, [])).toBe(0);
  });
});

describe('full-text-search.searchDocuments', () => {
  const docs = [
    mkDoc('apple banana cherry'),
    mkDoc('apple durian'),
    mkDoc('kiwi lime'),
    { ...mkDoc('apple pie'), tableId: 'tbl_b' },
  ];

  it('AND matches only docs containing both tokens', () => {
    const r = searchDocuments(docs, {
      tokens: [
        { value: 'apple', isPhrase: false },
        { value: 'banana', isPhrase: false },
      ],
      mode: 'and',
      limit: 10,
      sort: 'relevance',
    });
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]?.fieldId).toBe('fld_1');
  });

  it('OR matches any', () => {
    const r = searchDocuments(docs, {
      tokens: [
        { value: 'banana', isPhrase: false },
        { value: 'kiwi', isPhrase: false },
      ],
      mode: 'or',
      limit: 10,
      sort: 'relevance',
    });
    expect(r.total).toBeGreaterThanOrEqual(2);
  });

  it('filters by tableId', () => {
    const r = searchDocuments(docs, {
      tokens: [{ value: 'apple', isPhrase: false }],
      mode: 'or',
      tableId: 'tbl_b',
      limit: 10,
      sort: 'relevance',
    });
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]?.tableId).toBe('tbl_b');
  });

  it('filters by fields', () => {
    const r = searchDocuments(docs, {
      tokens: [{ value: 'apple', isPhrase: false }],
      mode: 'or',
      fields: ['fld_zz'],
      limit: 10,
      sort: 'relevance',
    });
    expect(r.hits).toEqual([]);
  });

  it('honors limit', () => {
    const r = searchDocuments(docs, {
      tokens: [{ value: 'apple', isPhrase: false }],
      mode: 'or',
      limit: 1,
      sort: 'relevance',
    });
    expect(r.hits).toHaveLength(1);
  });

  it('returns empty when no match', () => {
    const r = searchDocuments(docs, {
      tokens: [{ value: 'zzz', isPhrase: false }],
      mode: 'and',
      limit: 10,
      sort: 'relevance',
    });
    expect(r.total).toBe(0);
  });
});

describe('full-text-search.buildSearchQuery', () => {
  it('emits to_tsvector SQL', () => {
    const out = buildSearchQuery({
      query: {
        tokens: [{ value: 'foo', isPhrase: false }],
        mode: 'and',
        limit: 5,
      },
      schema: 'public',
      indexTable: 'search_index',
    });
    expect(out.sql).toContain('to_tsvector');
    expect(out.sql).toContain('to_tsquery');
    expect(out.params[0]).toBe('foo');
    expect(out.sql).toMatch(/LIMIT 5/);
  });

  it('emits phraseto_tsquery for phrases', () => {
    const out = buildSearchQuery({
      query: {
        tokens: [{ value: 'hello world', isPhrase: true }],
        mode: 'and',
        limit: 5,
      },
      schema: 'public',
      indexTable: 'search_index',
    });
    expect(out.sql).toContain('phraseto_tsquery');
  });

  it('escapes single quotes in phrase', () => {
    const out = buildSearchQuery({
      query: {
        tokens: [{ value: "O'Brien", isPhrase: true }],
        mode: 'and',
        limit: 5,
      },
      schema: 'public',
      indexTable: 'search_index',
    });
    expect(out.params.some((p) => p.includes("O''Brien"))).toBe(true);
  });

  it('marks negated tokens with !', () => {
    const out = buildSearchQuery({
      query: {
        tokens: [{ value: 'spam', isPhrase: false, negate: true }],
        mode: 'and',
        limit: 5,
      },
      schema: 'public',
      indexTable: 'search_index',
    });
    expect(out.params).toContain('!spam');
  });

  it('emits TRUE when no tokens', () => {
    const out = buildSearchQuery({
      query: { tokens: [], mode: 'and', limit: 5 },
      schema: 'public',
      indexTable: 'search_index',
    });
    expect(out.sql).toContain('TRUE');
  });
});

describe('full-text-search.shouldIndexField', () => {
  it('indexes text fields', () => {
    expect(shouldIndexField('text')).toBe(true);
    expect(shouldIndexField('longText')).toBe(true);
    expect(shouldIndexField('singleLineText')).toBe(true);
    expect(shouldIndexField('formula')).toBe(true);
  });
  it('skips non-text fields', () => {
    expect(shouldIndexField('number')).toBe(false);
    expect(shouldIndexField('checkbox')).toBe(false);
    expect(shouldIndexField('attachment')).toBe(false);
  });
});
