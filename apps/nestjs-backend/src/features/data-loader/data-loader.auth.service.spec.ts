/**
 * Data-loader — NestJS auth service spec (Stage 130).
 */

import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { DataLoaderAuthService } from './data-loader.auth.service';
import type { ILoadKey } from './data-loader.types';

function mkPrismaMock() {
  const tableFindFirst = vi.fn();
  const viewFindFirst = vi.fn();
  const fieldFindFirst = vi.fn();
  const prisma = {
    tableMeta: { findFirst: tableFindFirst },
    view: { findFirst: viewFindFirst },
    field: { findFirst: fieldFindFirst },
  } as unknown as PrismaService;
  return { prisma, mocks: { tableFindFirst, viewFindFirst, fieldFindFirst } };
}

const keys: ILoadKey[] = [
  { kind: 'table', id: 't1', composite: 'table:t1' },
  { kind: 'view', id: 'v1', composite: 'view:v1' },
  { kind: 'field', id: 'f1', composite: 'field:f1' },
];

describe('DataLoaderAuthService.inspectLoad', () => {
  it('reports registered keys as known, unregistered as missing', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.tableFindFirst.mockResolvedValue({ id: 't1' });
    mocks.viewFindFirst.mockResolvedValue(null);
    mocks.fieldFindFirst.mockResolvedValue({ id: 'f1' });
    const svc = new DataLoaderAuthService(prisma);
    const out = await svc.inspectLoad(keys);
    expect(out.requested).toBe(3);
    expect(out.unique.length).toBe(3);
    expect(out.known.map((k) => k.id)).toEqual(['t1', 'f1']);
    expect(out.missing.map((k) => k.id)).toEqual(['v1']);
  });

  it('dedupes repeated keys', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.tableFindFirst.mockResolvedValue({ id: 't1' });
    const svc = new DataLoaderAuthService(prisma);
    const dup: ILoadKey[] = [
      keys[0]!,
      keys[0]!,
      { ...keys[0]! },
    ];
    const out = await svc.inspectLoad(dup);
    expect(out.requested).toBe(3);
    expect(out.unique.length).toBe(1);
    expect(mocks.tableFindFirst).toHaveBeenCalledTimes(1);
  });
});

describe('DataLoaderAuthService encode / decode', () => {
  it('encode produces canonical composite', () => {
    const { prisma } = mkPrismaMock();
    const svc = new DataLoaderAuthService(prisma);
    expect(svc.encode('field', 'f1')).toBe('field:f1');
  });
  it('decode returns null on malformed input', () => {
    const { prisma } = mkPrismaMock();
    const svc = new DataLoaderAuthService(prisma);
    expect(svc.decode('no-colon')).toBeNull();
    expect(svc.decode('unknown:id')).toBeNull();
    expect(svc.decode(':id')).toBeNull();
  });
  it('decode parses a valid composite', () => {
    const { prisma } = mkPrismaMock();
    const svc = new DataLoaderAuthService(prisma);
    expect(svc.decode('view:v9')).toEqual({
      kind: 'view',
      id: 'v9',
      composite: 'view:v9',
    });
  });
});