/**
 * Database-view — NestJS auth service spec (Stage 130).
 */

import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { DatabaseViewAuthService } from './database-view.auth.service';

function mkPrismaMock() {
  const viewFindFirst = vi.fn();
  const prisma = {
    view: { findFirst: viewFindFirst },
  } as unknown as PrismaService;
  return { prisma, mocks: { viewFindFirst } };
}

describe('DatabaseViewAuthService.validateViewQuery', () => {
  it('returns invalid when view is missing or deleted', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.viewFindFirst.mockResolvedValue(null);
    const svc = new DatabaseViewAuthService(prisma);
    const out = await svc.validateViewQuery('v-missing');
    expect(out.valid).toBe(false);
    expect(out.reason).toBe('view-not-found');
    expect(out.clauses).toEqual([]);
  });

  it('parses filter / order / group into clauses', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.viewFindFirst.mockResolvedValue({
      id: 'v1',
      filter: 'status = active',
      order: 'createdAt DESC',
      group: 'category',
    });
    const svc = new DatabaseViewAuthService(prisma);
    const out = await svc.validateViewQuery('v1');
    expect(out.valid).toBe(true);
    expect(out.clauses.length).toBe(3);
    expect(out.clauses[0]?.kind).toBe('where');
    expect(out.clauses[1]?.kind).toBe('order');
    expect(out.clauses[2]?.kind).toBe('group');
  });
});

describe('DatabaseViewAuthService.format / summarize', () => {
  it('format renders uppercase kind prefix', () => {
    const { prisma } = mkPrismaMock();
    const svc = new DatabaseViewAuthService(prisma);
    expect(svc.format({ kind: 'where', sql: 'id = 1' })).toBe('WHERE id = 1');
    expect(svc.format({ kind: 'limit', sql: '100' })).toBe('LIMIT 100');
  });
  it('summarize returns empty summary for []', () => {
    const { prisma } = mkPrismaMock();
    const svc = new DatabaseViewAuthService(prisma);
    expect(svc.summarize([])).toEqual({ total: 0, distinct: 0, truncated: false });
  });
  it('summarize counts distinct first-column values', () => {
    const { prisma } = mkPrismaMock();
    const svc = new DatabaseViewAuthService(prisma);
    const rows = [
      { name: 'a' },
      { name: 'b' },
      { name: 'a' },
      { name: 'c' },
    ];
    expect(svc.summarize(rows)).toEqual({ total: 4, distinct: 3, truncated: false });
  });
});