/**
 * Full-text search — Stage 42.
 *
 * Pure helpers: tokenization, BM25-like scoring, snippet
 * generation, synonym expansion, and index/document row builders.
 */

import { createHash } from 'node:crypto';

import type {
  ICreateIndexInput,
  IIndexDocumentInput,
  ISearchDocument,
  ISearchHit,
  ISearchQueryInput,
  ISearchResult,
  ISearchSynonym,
  SearchIndexStatus,
  SearchLanguage,
  SearchScope,
} from './fulltext-search.types';
import { SUPPORTED_LANGUAGES, SUPPORTED_SCOPES } from './fulltext-search.types';

const TOKEN_SPLIT_REGEX = /[\s\p{P}]+/u;
const SNIPPET_RADIUS = 80;

/** Unicode-friendly whitespace + punctuation tokenizer with stopword removal. */
const STOPWORDS = new Set<string>([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'is',
  'are',
  'was',
  'were',
  'over',
  'but',
  'as',
]);

export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(TOKEN_SPLIT_REGEX)
    .filter((t) => t.length > 0)
    .filter((t) => !STOPWORDS.has(t));
}

export function stemApprox(token: string): string {
  // Very light suffix-stripping; not a real Porter stemmer.
  if (token.length < 4) return token;
  if (token.endsWith('ies') && token.length > 4) return token.slice(0, -3) + 'y';
  if (token.endsWith('ses') || token.endsWith('xes')) return token.slice(0, -2);
  if (token.endsWith('es') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function buildTokenStream(
  fields: ReadonlyArray<{ fieldId: string; value: string | null }>
): string {
  const all: string[] = [];
  for (const f of fields) {
    if (!f.value) continue;
    for (const t of tokenize(f.value)) {
      const s = stemApprox(t);
      if (s.length > 0) all.push(s);
    }
  }
  // dedupe while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of all) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.join(' ');
}

export function buildBodyText(
  fields: ReadonlyArray<{ fieldId: string; value: string | null }>
): string {
  return fields
    .map((f) => (f.value ?? '').trim())
    .filter((s) => s.length > 0)
    .join('\n')
    .toLowerCase();
}

export function contentHash(
  fields: ReadonlyArray<{ fieldId: string; value: string | null }>
): string {
  const normalized = fields
    .slice()
    .sort((a, b) => a.fieldId.localeCompare(b.fieldId))
    .map((f) => `${f.fieldId}=${f.value ?? ''}`)
    .join('|');
  return createHash('sha256').update(normalized).digest('hex');
}

export function buildSnippet(input: {
  body: string;
  queryTerms: ReadonlyArray<string>;
  radius?: number;
}): string {
  const body = input.body.toLowerCase();
  for (const term of input.queryTerms) {
    const idx = body.indexOf(term);
    if (idx === -1) continue;
    const radius = input.radius ?? SNIPPET_RADIUS;
    const start = Math.max(0, idx - radius);
    const end = Math.min(input.body.length, idx + term.length + radius);
    let snippet = input.body.slice(start, end);
    if (start > 0) snippet = '…' + snippet;
    if (end < input.body.length) snippet = snippet + '…';
    return snippet;
  }
  // No match — return head.
  const head = input.body.slice(0, 160);
  return head.length < input.body.length ? head + '…' : head;
}

/** BM25-style scoring against a single document. */
export function scoreDocument(input: {
  documentTokens: ReadonlyArray<string>;
  documentBody: string;
  queryTokens: ReadonlyArray<string>;
  averageDocLength: number;
  totalDocs: number;
  k1?: number;
  b?: number;
}): number {
  const k1 = input.k1 ?? 1.5;
  const b = input.b ?? 0.75;
  const docLength = input.documentTokens.length || 1;
  const tf = new Map<string, number>();
  for (const t of input.documentTokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  let score = 0;
  for (const qt of input.queryTokens) {
    const f = tf.get(qt) ?? 0;
    if (f === 0) continue;
    const idfApprox = Math.log(1 + (input.totalDocs + 1) / (1 + f));
    const denominator = f + k1 * (1 - b + (b * docLength) / Math.max(input.averageDocLength, 1));
    score += idfApprox * ((f * (k1 + 1)) / denominator);
  }
  return score;
}

export function expandSynonyms(input: {
  query: string;
  synonyms: ReadonlyArray<ISearchSynonym>;
}): string[] {
  const base = new Set<string>(tokenize(input.query));
  for (const syn of input.synonyms) {
    const owned = new Set<string>(tokenize(syn.synonymsCsv));
    owned.add(stemApprox(syn.term.toLowerCase()));
    if (base.has(stemApprox(syn.term.toLowerCase()))) {
      for (const s of owned) base.add(s);
    }
  }
  return Array.from(base);
}

export function isValidLanguage(lang: string): lang is SearchLanguage {
  return (SUPPORTED_LANGUAGES as ReadonlyArray<string>).includes(lang);
}

export function isValidScope(scope: string): scope is SearchScope {
  return (SUPPORTED_SCOPES as ReadonlyArray<string>).includes(scope);
}

export function isValidStatusTransition(from: SearchIndexStatus, to: SearchIndexStatus): boolean {
  const allow: Record<SearchIndexStatus, ReadonlyArray<SearchIndexStatus>> = {
    enabled: ['paused', 'rebuild', 'error'],
    paused: ['enabled', 'rebuild'],
    rebuild: ['enabled', 'paused', 'error'],
    error: ['enabled', 'paused'],
  };
  return allow[from]?.includes(to) ?? false;
}

export function buildIndexRow(input: ICreateIndexInput & { id: string }): {
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
} {
  return {
    id: input.id,
    baseId: input.baseId,
    tableId: input.tableId,
    scope: input.scope ?? 'row',
    status: 'enabled',
    fieldIdsCsv: input.fieldIdsCsv ?? null,
    language: input.language ?? 'english',
    lastBuiltAt: null,
    documentCount: 0,
    bytesUsed: BigInt(0),
    createdBy: input.createdBy,
    createdTime: new Date(),
    updatedTime: new Date(),
  };
}

export function buildDocumentRow(input: {
  id: string;
  indexId: string;
  recordId: string;
  fields: ReadonlyArray<{ fieldId: string; value: string | null }>;
}): Omit<ISearchDocument, 'lastIndexedAt'> & { lastIndexedAt: Date } {
  return {
    id: input.id,
    indexId: input.indexId,
    recordId: input.recordId,
    bodyText: buildBodyText(input.fields),
    tokens: buildTokenStream(input.fields),
    contentHash: contentHash(input.fields),
    lastIndexedAt: new Date(),
  };
}

/** Run a search across a list of documents, returning ranked hits. */
export function runSearch(
  input: ISearchQueryInput & {
    documents: ReadonlyArray<{ recordId: string; body: string; tokens: ReadonlyArray<string> }>;
    synonyms?: ReadonlyArray<ISearchSynonym>;
  }
): ISearchResult {
  const started = Date.now();
  const expanded = input.synonyms
    ? expandSynonyms({ query: input.queryText, synonyms: input.synonyms })
    : tokenize(input.queryText).map(stemApprox);
  const queryTokens = expanded.map(stemApprox);
  const totalDocs = input.documents.length;
  const averageDocLength =
    totalDocs === 0 ? 1 : input.documents.reduce((acc, d) => acc + d.tokens.length, 0) / totalDocs;
  const hits: ISearchHit[] = [];
  for (const doc of input.documents) {
    const score = scoreDocument({
      documentTokens: doc.tokens,
      documentBody: doc.body,
      queryTokens,
      averageDocLength,
      totalDocs,
    });
    if (score > 0) {
      hits.push({
        recordId: doc.recordId,
        score,
        snippet: buildSnippet({ body: doc.body, queryTerms: expanded }),
      });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 20;
  const sliced = hits.slice(offset, offset + limit);
  return {
    hits: sliced,
    total: hits.length,
    durationMs: Date.now() - started,
    normalizedQuery: queryTokens.join(' '),
    expandedTerms: expanded,
  };
}

export function indexDocumentRowFromInput(input: {
  indexId: string;
  recordId: string;
  fields: ReadonlyArray<{ fieldId: string; value: string | null }>;
}): Omit<ISearchDocument, 'id' | 'lastIndexedAt'> & { lastIndexedAt: Date } {
  return {
    indexId: input.indexId,
    recordId: input.recordId,
    bodyText: buildBodyText(input.fields),
    tokens: buildTokenStream(input.fields),
    contentHash: contentHash(input.fields),
    lastIndexedAt: new Date(),
  };
}
