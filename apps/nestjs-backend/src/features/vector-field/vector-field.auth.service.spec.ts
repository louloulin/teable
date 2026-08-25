/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { VectorFieldAuthService } from './vector-field.auth.service';

interface IMockVectorCollection {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}
interface IMockVectorRecord {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  vectorCollection: IMockVectorCollection;
  vectorRecord: IMockVectorRecord;
}

const buildPrisma = (): IMockPrisma => ({
  vectorCollection: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      status: 'building',
      lastIndexedAt: null,
      createdTime: new Date(),
      updatedTime: new Date(),
    })),
    findUnique: vi.fn(async () => null),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    delete: vi.fn(async () => undefined),
  },
  vectorRecord: {
    create: vi.fn(async ({ data }) => ({ ...data, createdTime: new Date() })),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
});

const buildSvc = () => {
  const prisma = buildPrisma();
  const svc = new VectorFieldAuthService(prisma as never);
  return { svc, prisma };
};

describe('VectorFieldAuthService (Stage 41)', () => {
  it('creates a collection and flips to ready', async () => {
    const { svc, prisma } = buildSvc();
    const r = await svc.createCollection({
      baseId: 'b1',
      name: 'docs',
      dimensions: 3,
      createdBy: 'u1',
    });
    expect(r.status).toBe('ready');
    expect(r.metric).toBe('cosine');
    expect(prisma.vectorCollection.create).toHaveBeenCalledTimes(1);
    expect(prisma.vectorCollection.update).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate collection name in same base', async () => {
    const { svc, prisma } = buildSvc();
    prisma.vectorCollection.findFirst.mockResolvedValueOnce({ id: 'existing' } as never);
    await expect(
      svc.createCollection({ baseId: 'b1', name: 'docs', dimensions: 3, createdBy: 'u1' })
    ).rejects.toThrow();
  });

  it('rejects invalid metric on creation', async () => {
    const { svc } = buildSvc();
    await expect(
      svc.createCollection({
        baseId: 'b1',
        name: 'docs',
        dimensions: 3,
        metric: 'mystery' as never,
        createdBy: 'u1',
      })
    ).rejects.toThrow();
  });

  it('upserts a record (new path)', async () => {
    const { svc, prisma } = buildSvc();
    prisma.vectorCollection.findUnique.mockResolvedValueOnce({
      id: 'c1',
      dimensions: 3,
      metric: 'cosine',
      status: 'ready',
    } as never);
    const r = await svc.upsertRecord({
      collectionId: 'c1',
      sourceRef: 't:1:f',
      embedding: [1, 0, 0],
      content: 'hello',
      model: 'm',
    });
    expect(r.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(prisma.vectorRecord.create).toHaveBeenCalledTimes(1);
  });

  it('upserts a record (existing path) updates embedding + content', async () => {
    const { svc, prisma } = buildSvc();
    prisma.vectorCollection.findUnique.mockResolvedValueOnce({
      id: 'c1',
      dimensions: 3,
      metric: 'cosine',
      status: 'ready',
    } as never);
    prisma.vectorRecord.findFirst.mockResolvedValueOnce({
      id: 'r-old',
      collectionId: 'c1',
      sourceRef: 't:1:f',
    } as never);
    await svc.upsertRecord({
      collectionId: 'c1',
      sourceRef: 't:1:f',
      embedding: [1, 0, 0],
      content: 'hello',
      model: 'm',
    });
    expect(prisma.vectorRecord.update).toHaveBeenCalledTimes(1);
    expect(prisma.vectorRecord.create).not.toHaveBeenCalled();
  });

  it('refuses upserts into a paused collection', async () => {
    const { svc, prisma } = buildSvc();
    prisma.vectorCollection.findUnique.mockResolvedValueOnce({
      id: 'c1',
      dimensions: 3,
      metric: 'cosine',
      status: 'paused',
    } as never);
    await expect(
      svc.upsertRecord({
        collectionId: 'c1',
        sourceRef: 't:1:f',
        embedding: [1, 0, 0],
        content: 'hello',
        model: 'm',
      })
    ).rejects.toThrow(/paused/);
  });

  it('refuses upserts when collection not found', async () => {
    const { svc } = buildSvc();
    await expect(
      svc.upsertRecord({
        collectionId: 'c1',
        sourceRef: 't:1:f',
        embedding: [1, 0, 0],
        content: 'hello',
        model: 'm',
      })
    ).rejects.toThrow(/collection not found/);
  });

  it('search ranks records and assembles a RAG prompt', async () => {
    const { svc, prisma } = buildSvc();
    prisma.vectorCollection.findUnique.mockResolvedValueOnce({
      id: 'c1',
      metric: 'cosine',
      dimensions: 3,
      status: 'ready',
    } as never);
    prisma.vectorRecord.findMany.mockResolvedValueOnce([
      {
        id: 'r1',
        sourceRef: 'a',
        embedding: JSON.stringify([1, 0, 0]),
        content: 'alpha',
        contentHash: 'h',
      },
      {
        id: 'r2',
        sourceRef: 'b',
        embedding: JSON.stringify([0, 1, 0]),
        content: 'beta',
        contentHash: 'h',
      },
    ] as never);
    const out = await svc.search({ collectionId: 'c1', queryEmbedding: [1, 0, 0], topK: 5 });
    expect(out.hits).toHaveLength(2);
    expect(out.prompt).toContain('[#1 score=1.000');
  });

  it('search throws when collection missing', async () => {
    const { svc } = buildSvc();
    await expect(
      svc.search({ collectionId: 'c1', queryEmbedding: [1, 0], topK: 1 })
    ).rejects.toThrow();
  });

  it('pauses / resumes collection', async () => {
    const { svc, prisma } = buildSvc();
    prisma.vectorCollection.findUnique.mockResolvedValueOnce({
      id: 'c1',
      status: 'ready',
    } as never);
    const r = await svc.pauseCollection('c1');
    expect(r.status).toBe('paused');
    prisma.vectorCollection.findUnique.mockResolvedValueOnce({
      id: 'c1',
      status: 'paused',
    } as never);
    const r2 = await svc.resumeCollection('c1');
    expect(r2.status).toBe('ready');
  });

  it('pause is a no-op when already paused', async () => {
    const { svc, prisma } = buildSvc();
    prisma.vectorCollection.findUnique.mockResolvedValueOnce({
      id: 'c1',
      status: 'paused',
    } as never);
    const r = await svc.pauseCollection('c1');
    expect(r.status).toBe('paused');
    expect(prisma.vectorCollection.update).not.toHaveBeenCalled();
  });

  it('delete cascades records then collection', async () => {
    const { svc, prisma } = buildSvc();
    prisma.vectorCollection.findUnique.mockResolvedValueOnce({ id: 'c1' } as never);
    await svc.deleteCollection('c1');
    expect(prisma.vectorRecord.deleteMany).toHaveBeenCalledWith({ where: { collectionId: 'c1' } });
    expect(prisma.vectorCollection.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('delete throws on missing collection', async () => {
    const { svc } = buildSvc();
    await expect(svc.deleteCollection('missing')).rejects.toThrow();
  });

  it('listCollections filters by baseId', async () => {
    const { svc, prisma } = buildSvc();
    prisma.vectorCollection.findMany.mockResolvedValueOnce([{ id: 'c1', baseId: 'b1' }] as never);
    const out = await svc.listCollections('b1');
    expect(out).toHaveLength(1);
    expect(prisma.vectorCollection.findMany).toHaveBeenCalledWith({ where: { baseId: 'b1' } });
  });
});
