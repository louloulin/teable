import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildCollectionRow,
  buildRagPrompt,
  buildRecordRow,
  isValidDimensions,
  isValidMetric,
  search,
  validateCreateCollection,
} from './vector-field.service';
import type {
  DistanceMetric,
  ICreateCollectionInput,
  ISearchInput,
  ISimilarityHit,
  IUpsertRecordInput,
  IVectorCollection,
  IVectorRecord,
} from './vector-field.types';
import { DEFAULT_TOP_K } from './vector-field.types';

@Injectable()
export class VectorFieldAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async createCollection(input: ICreateCollectionInput): Promise<IVectorCollection> {
    try {
      validateCreateCollection(input);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const dup = await this.prisma.vectorCollection.findFirst({
      where: { baseId: input.baseId, name: input.name },
    });
    if (dup) throw new BadRequestException(`collection exists: ${input.name}`);
    const id = `vc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildCollectionRow({ id, ...input });
    const created = await this.prisma.vectorCollection.create({
      data: {
        id: row.id,
        baseId: row.baseId,
        name: row.name,
        metric: row.metric,
        dimensions: row.dimensions,
        createdBy: row.createdBy,
      },
    });
    await this.prisma.vectorCollection.update({
      where: { id: row.id },
      data: { status: 'ready', updatedTime: new Date() },
    });
    return { ...toCollection(created), status: 'ready' };
  }

  async getCollection(collectionId: string): Promise<IVectorCollection | null> {
    const row = await this.prisma.vectorCollection.findUnique({ where: { id: collectionId } });
    return row ? toCollection(row) : null;
  }

  async listCollections(baseId: string): Promise<IVectorCollection[]> {
    const rows = await this.prisma.vectorCollection.findMany({ where: { baseId } });
    return rows.map(toCollection);
  }

  async pauseCollection(collectionId: string): Promise<IVectorCollection> {
    const existing = await this.prisma.vectorCollection.findUnique({ where: { id: collectionId } });
    if (!existing) throw new NotFoundException(`collection not found: ${collectionId}`);
    if (existing.status === 'paused') return toCollection(existing);
    const updated = await this.prisma.vectorCollection.update({
      where: { id: collectionId },
      data: { status: 'paused', updatedTime: new Date() },
    });
    return toCollection(updated);
  }

  async resumeCollection(collectionId: string): Promise<IVectorCollection> {
    const existing = await this.prisma.vectorCollection.findUnique({ where: { id: collectionId } });
    if (!existing) throw new NotFoundException(`collection not found: ${collectionId}`);
    const updated = await this.prisma.vectorCollection.update({
      where: { id: collectionId },
      data: { status: 'ready', updatedTime: new Date() },
    });
    return toCollection(updated);
  }

  async deleteCollection(collectionId: string): Promise<void> {
    const existing = await this.prisma.vectorCollection.findUnique({ where: { id: collectionId } });
    if (!existing) throw new NotFoundException(`collection not found: ${collectionId}`);
    await this.prisma.vectorRecord.deleteMany({ where: { collectionId } });
    await this.prisma.vectorCollection.delete({ where: { id: collectionId } });
  }

  /** Idempotent upsert keyed by `(collectionId, sourceRef)`. */
  async upsertRecord(input: IUpsertRecordInput & { model: string }): Promise<IVectorRecord> {
    const collection = await this.prisma.vectorCollection.findUnique({
      where: { id: input.collectionId },
    });
    if (!collection) throw new NotFoundException(`collection not found: ${input.collectionId}`);
    if (collection.status === 'paused') throw new BadRequestException('collection is paused');
    if (!isValidDimensions(collection.dimensions))
      throw new BadRequestException('collection has invalid dimensions');
    if (!isValidMetric(collection.metric as DistanceMetric))
      throw new BadRequestException('collection has invalid metric');
    const existing = await this.prisma.vectorRecord.findFirst({
      where: { collectionId: input.collectionId, sourceRef: input.sourceRef },
    });
    const row = buildRecordRow({
      id:
        existing?.id ?? `vr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      collectionId: input.collectionId,
      sourceRef: input.sourceRef,
      embedding: input.embedding,
      content: input.content,
      model: input.model,
      dimensions: collection.dimensions,
    });
    const upserted = existing
      ? await this.prisma.vectorRecord.update({
          where: { id: existing.id },
          data: {
            embedding: JSON.stringify(row.embedding),
            content: row.content,
            contentHash: row.contentHash,
          },
        })
      : await this.prisma.vectorRecord.create({
          data: {
            id: row.id,
            collectionId: row.collectionId,
            sourceRef: row.sourceRef,
            embedding: JSON.stringify(row.embedding),
            content: row.content,
            contentHash: row.contentHash,
          },
        });
    await this.prisma.vectorCollection.update({
      where: { id: input.collectionId },
      data: { lastIndexedAt: new Date(), updatedTime: new Date() },
    });
    return toRecord(upserted, collection.dimensions);
  }

  async search(
    input: ISearchInput
  ): Promise<{ hits: Record<ISimilarityHit, unknown>[]; prompt: string }> {
    const collection = await this.prisma.vectorCollection.findUnique({
      where: { id: input.collectionId },
    });
    if (!collection) throw new NotFoundException(`collection not found: ${input.collectionId}`);
    const records = await this.prisma.vectorRecord.findMany({
      where: { collectionId: input.collectionId },
    });
    const deserialized = records.map((r) => ({
      ...r,
      embedding: JSON.parse(r.embedding as string) as number[],
    }));
    const ranked = search(
      {
        collectionId: input.collectionId,
        queryEmbedding: input.queryEmbedding,
        topK: Math.min(input.topK, 100),
        minScore: input.minScore,
      },
      deserialized,
      collection.metric as DistanceMetric
    );
    const hits: ISimilarityHit[] = ranked.map((h) => ({
      recordId: h.recordId,
      sourceRef: h.sourceRef,
      score: h.score,
      content: h.content,
    }));
    const prompt = buildRagPrompt({ query: '', hits });
    return { hits: hits as unknown as Record<ISimilarityHit, unknown>[], prompt };
  }

  async deleteRecord(recordId: string): Promise<void> {
    await this.prisma.vectorRecord.delete({ where: { id: recordId } });
  }

  buildRagPrompt = buildRagPrompt;
  DEFAULT_TOP_K = DEFAULT_TOP_K;
}

function toCollection(r: {
  id: string;
  baseId: string;
  name: string;
  metric: string;
  dimensions: number;
  status: string;
  lastIndexedAt: Date | null;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}): IVectorCollection {
  return {
    id: r.id,
    baseId: r.baseId,
    name: r.name,
    metric: r.metric as DistanceMetric,
    dimensions: r.dimensions,
    status: r.status as IVectorCollection['status'],
    lastIndexedAt: r.lastIndexedAt,
    createdBy: r.createdBy,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}

function toRecord(
  r: {
    id: string;
    collectionId: string;
    sourceRef: string;
    embedding: string | number[];
    content: string;
    contentHash: string;
    createdTime: Date;
  },
  dimensions: number
): IVectorRecord {
  const embedding = Array.isArray(r.embedding)
    ? r.embedding
    : (JSON.parse(r.embedding) as number[]);
  void dimensions;
  return {
    id: r.id,
    collectionId: r.collectionId,
    sourceRef: r.sourceRef,
    embedding,
    content: r.content,
    contentHash: r.contentHash,
    createdTime: r.createdTime,
  };
}
