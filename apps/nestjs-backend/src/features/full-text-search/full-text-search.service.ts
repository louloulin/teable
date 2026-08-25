/**
 * Full-text search — Stage 51.
 *
 * Pure helpers: tokenization, index update, query parsing, scoring,
 * and SQL emission. The auth service persists indexes in Prisma and
 * serves queries.
 */

import type {
  IIndexDocumentInput,
  IIndexedDocument,
  ISearchHit,
  ISearchQuery,
  ISearchResult,
  ISearchToken,
  SearchMatchMode,
} from './full-text-search.types';
import {
  DEFAULT_MATCH_MODE,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_SORT,
  MAX_PHRASE_TOKENS,
  MAX_SEARCH_LIMIT,
  MAX_TOKEN_LENGTH,
  MIN_TOKEN_LENGTH,
} from './full-text-search.types';

/** Lowercase + strip diacritics (best-effort Unicode normalization). */
export function normalizeText(input: string): string {
  return input.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/** Split a string into raw word tokens (Unicode letter+digit runs). */
export function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  return normalized
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Filter tokens by min/max length. */
export function filterTokens(tokens: ReadonlyArray<string>): string[] {
  return tokens
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && t.length <= MAX_TOKEN_LENGTH)
    .slice(0, MAX_PHRASE_TOKENS * 16);
}

/** Build adjacency bigrams from a token list. */
export function buildBigrams(tokens: ReadonlyArray<string>): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    out.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return out;
}

/** Build an indexed document from raw text. */
export function buildIndexedDocument(input: IIndexDocumentInput): IIndexedDocument {
  const tokens = filterTokens(tokenize(input.text));
  return {
    tableId: input.tableId,
    recordId: input.recordId,
    fieldId: input.fieldId,
    tokens,
    bigrams: buildBigrams(tokens),
    tokenCount: tokens.length,
    indexedAt: new Date(),
  };
}

/** Parse a free-text query string into structured tokens. */
export function parseQueryString(q: string): ISearchToken[] {
  const out: ISearchToken[] = [];
  // Phrase: "..."
  const phraseRe = /"([^"]+)"/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = phraseRe.exec(q)) !== null) {
    if (m.index > cursor) {
      pushWords(out, q.slice(cursor, m.index));
    }
    const phrase = m[1]?.trim();
    if (phrase && phrase.length > 0) {
      out.push({ value: phrase, isPhrase: true });
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < q.length) pushWords(out, q.slice(cursor));
  return out;
}

function pushWords(out: ISearchToken[], chunk: string): void {
  // Strip orphan quote chars from unmatched phrase delimiters.
  const cleaned = chunk.replace(/['"]+/g, ' ');
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  for (const raw of words) {
    let negate = false;
    let value = raw;
    if (value.startsWith('-') && value.length > 1) {
      negate = true;
      value = value.slice(1);
    }
    if (value.length === 0) continue;
    out.push({ value, isPhrase: false, negate });
  }
}

/** Validate a structured query. Throws on invalid input. */
export function validateQuery(q: ISearchQuery): void {
  if (!q) throw new Error('query required');
  if (!Array.isArray(q.tokens) || q.tokens.length === 0) throw new Error('query.tokens required');
  if (q.mode !== 'and' && q.mode !== 'or') throw new Error(`invalid mode: ${q.mode}`);
  if (q.limit !== undefined && (q.limit < 1 || q.limit > MAX_SEARCH_LIMIT)) {
    throw new Error(`limit out of range (1-${MAX_SEARCH_LIMIT})`);
  }
  if (q.sort && q.sort !== 'relevance' && q.sort !== 'recent') {
    throw new Error(`invalid sort: ${q.sort}`);
  }
  for (const t of q.tokens) {
    if (!t || typeof t.value !== 'string' || t.value.length === 0) {
      throw new Error('token.value required');
    }
    if (t.isPhrase && t.value.split(/\s+/).length > MAX_PHRASE_TOKENS) {
      throw new Error(`phrase too long (max ${MAX_PHRASE_TOKENS} tokens)`);
    }
  }
}

export function normalizeQuery(
  q: Partial<ISearchQuery> & { tokens?: ISearchToken[] }
): ISearchQuery {
  return {
    tokens: q.tokens ?? [],
    mode: (q.mode ?? DEFAULT_MATCH_MODE) as SearchMatchMode,
    fields: q.fields,
    tableId: q.tableId,
    limit: q.limit ?? DEFAULT_SEARCH_LIMIT,
    sort: q.sort ?? DEFAULT_SORT,
  };
}

/** Score a single document against a structured query. */
export function scoreDocument(
  doc: IIndexedDocument,
  query: ISearchQuery
): { score: number; matched: string[] } | null {
  const tokens = new Set(doc.tokens);
  const bigrams = new Set(doc.bigrams);
  const matched: string[] = [];
  let score = 0;
  let positiveRequired = 0;
  let positiveMatched = 0;
  for (const t of query.tokens) {
    if (t.isPhrase) {
      const phraseTokens = t.value.split(/\s+/).filter((w) => w.length > 0);
      const hit = phraseTokens.every((w, i) =>
        i + 1 < phraseTokens.length
          ? bigrams.has(`${phraseTokens[i]} ${phraseTokens[i + 1]}`)
          : tokens.has(w)
      );
      if (hit) {
        score += 5;
        matched.push(t.value);
        if (!t.negate) positiveMatched += 1;
      } else if (!t.negate) {
        return null;
      }
    } else {
      if (tokens.has(t.value)) {
        score += 2;
        matched.push(t.value);
        if (!t.negate) positiveMatched += 1;
      } else if (t.negate) {
        // Negated token absent — fine.
      } else {
        if (query.mode === 'and') return null;
      }
    }
    if (!t.negate) positiveRequired += 1;
  }
  if (positiveRequired === 0) return null;
  if (query.mode === 'and' && positiveMatched < positiveRequired) return null;
  return { score, matched };
}

/** Convert a score + total tokens into a 0..1 normalized relevance. */
export function normalizeScore(score: number, tokenCount: number): number {
  if (tokenCount === 0) return 0;
  return Math.min(1, score / Math.max(1, tokenCount * 2));
}

/** Find the first matched token's offset in the document. */
export function findTokenOffset(doc: IIndexedDocument, matched: ReadonlyArray<string>): number {
  for (const m of matched) {
    const idx = doc.tokens.indexOf(m);
    if (idx >= 0) return idx;
  }
  return 0;
}

/** Run a query against a list of documents, returning sorted hits. */
export function searchDocuments(
  documents: ReadonlyArray<IIndexedDocument>,
  query: ISearchQuery
): ISearchResult {
  const startedAt = Date.now();
  const matches: ISearchHit[] = [];
  for (const doc of documents) {
    if (query.tableId && doc.tableId !== query.tableId) continue;
    if (query.fields && !query.fields.includes(doc.fieldId)) continue;
    const result = scoreDocument(doc, query);
    if (!result) continue;
    matches.push({
      tableId: doc.tableId,
      recordId: doc.recordId,
      fieldId: doc.fieldId,
      score: normalizeScore(result.score, doc.tokenCount),
      matchedTokens: result.matched,
      tokenOffset: findTokenOffset(doc, result.matched),
    });
  }
  matches.sort((a, b) => {
    if (query.sort === 'recent') return b.score - a.score;
    return b.score - a.score;
  });
  const limit = query.limit ?? DEFAULT_SEARCH_LIMIT;
  const sliced = matches.slice(0, limit);
  return {
    hits: sliced,
    total: matches.length,
    query,
    elapsedMs: Date.now() - startedAt,
  };
}

/**
 * Build a SQL fragment for Postgres `tsvector`/`tsquery`. This is the
 * bridge from the portable index to a native FTS plan. Callers
 * combine this with their own `SELECT` / `WHERE` shape.
 */
export function buildSearchQuery(args: {
  query: ISearchQuery;
  schema: string;
  indexTable: string;
}): { sql: string; params: string[] } {
  const params: string[] = [];
  const conds: string[] = [];
  for (const t of args.query.tokens) {
    if (t.isPhrase) {
      const phrase = t.value.replace(/'/g, "''");
      params.push(phrase);
      conds.push(`to_tsvector('simple', text) @@ phraseto_tsquery('simple', $${params.length})`);
    } else {
      const v = t.value.replace(/'/g, "''");
      params.push(t.negate ? `!${v}` : v);
      conds.push(`to_tsvector('simple', text) @@ to_tsquery('simple', $${params.length})`);
    }
  }
  const where = conds.length === 0 ? 'TRUE' : conds.join(' AND ');
  const sql = `SELECT record_id, field_id, ts_rank(to_tsvector('simple', text), plainto_tsquery('simple', $1)) AS score
FROM ${args.schema}.${args.indexTable}
WHERE ${where}
LIMIT ${args.query.limit ?? DEFAULT_SEARCH_LIMIT}`;
  return { sql, params: [args.query.tokens.map((t) => t.value).join(' '), ...params] };
}

/** Decide whether a field's text should be indexed (whitelist). */
export function shouldIndexField(fieldType: string): boolean {
  return (
    fieldType === 'text' ||
    fieldType === 'longText' ||
    fieldType === 'singleLineText' ||
    fieldType === 'formula' ||
    fieldType === 'autoNumber'
  );
}
