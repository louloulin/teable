/**
 * Full-text search — Stage 42 types.
 *
 * Per-table index configuration, per-record indexed document,
 * per-query audit log, and per-index synonym dictionary.
 */

export type SearchScope = 'row' | 'record-history' | 'comments';

export type SearchIndexStatus = 'enabled' | 'paused' | 'rebuild' | 'error';

export type SearchLanguage = 'english' | 'simple' | 'chinese' | 'german' | 'french' | 'spanish';

export interface ISearchIndex {
  id: string;
  baseId: string;
  tableId: string;
  scope: SearchScope;
  status: SearchIndexStatus;
  fieldIdsCsv: string | null;
  language: SearchLanguage;
  lastBuiltAt: Date | null;
  documentCount: number;
  bytesUsed: bigint;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}

export interface ISearchDocument {
  id: string;
  indexId: string;
  recordId: string;
  bodyText: string;
  tokens: string;
  contentHash: string;
  lastIndexedAt: Date;
}

export interface ISearchQueryLog {
  id: string;
  indexId: string;
  userId: string | null;
  queryText: string;
  hitCount: number;
  durationMs: number;
  occurredAt: Date;
}

export interface ISearchSynonym {
  id: string;
  indexId: string | null;
  term: string;
  synonymsCsv: string;
  createdBy: string;
  createdTime: Date;
}

export interface ICreateIndexInput {
  baseId: string;
  tableId: string;
  scope?: SearchScope;
  fieldIdsCsv?: string | null;
  language?: SearchLanguage;
  createdBy: string;
}

export interface IUpdateIndexInput {
  status?: SearchIndexStatus;
  fieldIdsCsv?: string | null;
  language?: SearchLanguage;
}

export interface IIndexDocumentInput {
  indexId: string;
  recordId: string;
  /// Source text fields from the record.
  fields: ReadonlyArray<{ fieldId: string; value: string | null }>;
}

export interface ISearchQueryInput {
  indexId: string;
  queryText: string;
  userId?: string | null;
  limit?: number;
  offset?: number;
}

export interface ISearchHit {
  recordId: string;
  score: number;
  snippet: string;
}

export interface ISearchResult {
  hits: ISearchHit[];
  total: number;
  durationMs: number;
  normalizedQuery: string;
  expandedTerms: string[];
}

export interface IAddSynonymInput {
  indexId?: string | null;
  term: string;
  synonyms: ReadonlyArray<string>;
  createdBy: string;
}

export const SUPPORTED_LANGUAGES: ReadonlyArray<SearchLanguage> = [
  'english',
  'simple',
  'chinese',
  'german',
  'french',
  'spanish',
];
export const SUPPORTED_SCOPES: ReadonlyArray<SearchScope> = ['row', 'record-history', 'comments'];
