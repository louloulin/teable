/**
 * Vector field & RAG collection — Stage 41 types.
 *
 * Embedding store + similarity search over a per-base collection.
 * Vectors are stored opaque (caller-side Float32 list); we provide
 * deterministic hashing for content-addressed embedding IDs and
 * cosine similarity computation.
 */

export type DistanceMetric = 'cosine' | 'dotProduct' | 'euclidean';

export type IndexStatus = 'building' | 'ready' | 'paused' | 'error';

export interface IVectorCollection {
  id: string;
  baseId: string;
  name: string;
  metric: DistanceMetric;
  dimensions: number;
  status: IndexStatus;
  lastIndexedAt: Date | null;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}

export interface IVectorRecord {
  id: string;
  collectionId: string;
  /** Foreign key into the originating table, e.g. `${tableId}:${recordId}:${fieldId}`. */
  sourceRef: string;
  /** Opaque float array (length === dimensions). */
  embedding: ReadonlyArray<number>;
  /** Caller-provided snippet, stored alongside the vector for retrieval. */
  content: string;
  /** SHA-256 of `${model}:${content}` for idempotent upsert. */
  contentHash: string;
  createdTime: Date;
}

export interface ISimilarityHit {
  recordId: string;
  sourceRef: string;
  score: number;
  content: string;
}

export interface ISearchInput {
  collectionId: string;
  queryEmbedding: ReadonlyArray<number>;
  topK: number;
  minScore?: number;
}

export interface ICreateCollectionInput {
  baseId: string;
  name: string;
  metric?: DistanceMetric;
  dimensions: number;
  createdBy: string;
}

export interface IUpsertRecordInput {
  collectionId: string;
  sourceRef: string;
  embedding: ReadonlyArray<number>;
  content: string;
  model: string;
}

export const SUPPORTED_METRICS: ReadonlyArray<DistanceMetric> = [
  'cosine',
  'dotProduct',
  'euclidean',
];

export const DEFAULT_TOP_K = 5;
export const MIN_DIMENSIONS = 1;
export const MAX_DIMENSIONS = 4_096;
