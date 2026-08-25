/**
 * Vector field — Stage 41.
 *
 * Pure helpers: dimension / metric validation, cosine similarity,
 * deterministic content-hash, top-k ranking, RAG prompt assembly,
 * and an in-memory store used by tests + small deployments.
 */

import { createHash } from 'node:crypto';

import type {
  DistanceMetric,
  ICreateCollectionInput,
  ISearchInput,
  ISimilarityHit,
  IVectorCollection,
  IVectorRecord,
} from './vector-field.types';
import { MAX_DIMENSIONS, MIN_DIMENSIONS, SUPPORTED_METRICS } from './vector-field.types';

export function isValidMetric(m: string): m is DistanceMetric {
  return (SUPPORTED_METRICS as ReadonlyArray<string>).includes(m);
}

export function isValidDimensions(d: number): boolean {
  return Number.isInteger(d) && d >= MIN_DIMENSIONS && d <= MAX_DIMENSIONS;
}

export function isValidCollectionName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 64 && /^[a-zA-Z0-9 _.\-]+$/.test(trimmed);
}

export function cosineSimilarity(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  if (a.length !== b.length) throw new Error('dimension mismatch');
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export function dotProduct(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  if (a.length !== b.length) throw new Error('dimension mismatch');
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

export function euclideanDistance(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  if (a.length !== b.length) throw new Error('dimension mismatch');
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    s += d * d;
  }
  return Math.sqrt(s);
}

export function score(
  metric: DistanceMetric,
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number>
): number {
  switch (metric) {
    case 'cosine':
      return cosineSimilarity(a, b);
    case 'dotProduct':
      return dotProduct(a, b);
    case 'euclidean':
      return -euclideanDistance(a, b); // higher is better
  }
}

export function hashContent(input: { model: string; content: string }): string {
  return createHash('sha256').update(`${input.model}:${input.content}`).digest('hex');
}

export function validateCreateCollection(input: ICreateCollectionInput): void {
  if (!isValidCollectionName(input.name)) throw new Error('invalid collection name');
  if (!isValidDimensions(input.dimensions)) throw new Error('invalid dimensions');
  if (input.metric && !isValidMetric(input.metric)) throw new Error('invalid metric');
}

export function buildCollectionRow(
  input: ICreateCollectionInput & { id: string }
): IVectorCollection {
  validateCreateCollection(input);
  return {
    id: input.id,
    baseId: input.baseId,
    name: input.name,
    metric: input.metric ?? 'cosine',
    dimensions: input.dimensions,
    status: 'building',
    lastIndexedAt: null,
    createdBy: input.createdBy,
    createdTime: new Date(),
    updatedTime: new Date(),
  };
}

export function buildRecordRow(input: {
  id: string;
  collectionId: string;
  sourceRef: string;
  embedding: ReadonlyArray<number>;
  content: string;
  model: string;
  dimensions: number;
}): IVectorRecord {
  if (input.embedding.length !== input.dimensions) throw new Error('embedding dimension mismatch');
  return {
    id: input.id,
    collectionId: input.collectionId,
    sourceRef: input.sourceRef,
    embedding: input.embedding.slice(),
    content: input.content,
    contentHash: hashContent({ model: input.model, content: input.content }),
    createdTime: new Date(),
  };
}

export interface IRankedHit extends ISimilarityHit {
  rank: number;
}

/** Rank records by similarity, filter by minScore, return top-K. */
export function runSimilaritySearch(input: {
  metric: DistanceMetric;
  query: ReadonlyArray<number>;
  records: ReadonlyArray<{
    id: string;
    sourceRef: string;
    embedding: ReadonlyArray<number>;
    content: string;
  }>;
  topK: number;
  minScore?: number;
}): IRankedHit[] {
  const scored = input.records.map((r) => ({
    recordId: r.id,
    sourceRef: r.sourceRef,
    score: score(input.metric, input.query, r.embedding),
    content: r.content,
  }));
  scored.sort((a, b) => b.score - a.score);
  const filtered =
    input.minScore !== undefined ? scored.filter((h) => h.score >= input.minScore!) : scored;
  return filtered.slice(0, input.topK).map((h, i) => ({ ...h, rank: i + 1 }));
}

export function search(
  input: ISearchInput,
  records: ReadonlyArray<IVectorRecord>,
  metric: DistanceMetric
): IRankedHit[] {
  return runSimilaritySearch({
    metric,
    query: input.queryEmbedding,
    records: records.map((r) => ({
      id: r.id,
      sourceRef: r.sourceRef,
      embedding: r.embedding,
      content: r.content,
    })),
    topK: input.topK,
    minScore: input.minScore,
  });
}

/** Trim a hit's content to fit a context window (rough char budget). */
export function trimHitContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, Math.max(0, maxChars - 1)) + '…';
}

export function buildRagPrompt(input: {
  query: string;
  hits: ReadonlyArray<ISimilarityHit>;
  maxSnippetChars?: number;
  separator?: string;
}): string {
  const sep = input.separator ?? '\n\n---\n\n';
  const max = input.maxSnippetChars ?? 800;
  const parts = input.hits.map(
    (h, i) =>
      `[#${i + 1} score=${h.score.toFixed(3)} ${h.sourceRef}]\n${trimHitContent(h.content, max)}`
  );
  return [
    'Use the following context to answer the question. Cite the [#N] tags.',
    parts.join(sep),
    `Question: ${input.query}`,
  ].join('\n\n');
}
