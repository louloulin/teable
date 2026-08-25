/**
 * Full-text search — Stage 51.
 *
 * Postgres tsvector-style inverted index for table cells. We keep the
 * API language/operator dialect portable (FTS-1) and document the
 * SQL emission in `buildSearchQuery` so callers can swap in
 * `to_tsvector` / `to_tsquery` when targeting Postgres directly.
 *
 * Indexing strategy:
 *  - Tokenize each cell value (UTF-8) into lowercase unigrams and
 *    bigrams; we keep the data structure portable so any backend
 *    that exposes raw cell text can drive this.
 *  - Per-record inverted index keyed by (tableId, recordId, fieldId).
 *  - Query supports AND/OR/NOT, phrase (ordered adjacency), and
 *    field scoping.
 */

export type SearchMatchMode = 'and' | 'or';

export type SearchSort = 'relevance' | 'recent';

export interface IIndexedField {
  tableId: string;
  fieldId: string;
}

export interface IIndexDocumentInput {
  tableId: string;
  recordId: string;
  fieldId: string;
  text: string;
}

export interface IIndexedDocument {
  tableId: string;
  recordId: string;
  fieldId: string;
  tokens: ReadonlyArray<string>;
  bigrams: ReadonlyArray<string>;
  tokenCount: number;
  indexedAt: Date;
}

export interface ISearchToken {
  /** Single token, or multi-token phrase when `isPhrase`. */
  value: string;
  isPhrase: boolean;
  /** Negate (NOT) this token in the final match. */
  negate?: boolean;
}

export interface ISearchQuery {
  tokens: ReadonlyArray<ISearchToken>;
  /** Match mode for un-negated tokens. */
  mode: SearchMatchMode;
  /** Restrict to specific fields (optional). */
  fields?: ReadonlyArray<string>;
  /** Restrict to a specific table (optional). */
  tableId?: string;
  /** Max results to return. */
  limit?: number;
  /** Sort order. */
  sort?: SearchSort;
}

export interface ISearchHit {
  tableId: string;
  recordId: string;
  fieldId: string;
  /** Relevance score (higher = more relevant). */
  score: number;
  /** The matched token set. */
  matchedTokens: ReadonlyArray<string>;
  /** Position of the matched token in the indexed text (for snippets). */
  tokenOffset: number;
}

export interface ISearchResult {
  hits: ReadonlyArray<ISearchHit>;
  total: number;
  query: ISearchQuery;
  /** Elapsed milliseconds (caller-supplied). */
  elapsedMs: number;
}

export const DEFAULT_SEARCH_LIMIT = 25;
export const MAX_SEARCH_LIMIT = 200;
export const DEFAULT_MATCH_MODE: SearchMatchMode = 'and';
export const DEFAULT_SORT: SearchSort = 'relevance';
export const MIN_TOKEN_LENGTH = 2;
export const MAX_TOKEN_LENGTH = 64;
export const MAX_PHRASE_TOKENS = 8;
