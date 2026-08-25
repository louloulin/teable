/* eslint-disable @typescript-eslint/naming-convention */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

import { hashPageToken, PageDesignerAuthService } from './page-designer.auth.service';

interface IMockPageTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockTokenTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  pageDefinition: IMockPageTable;
  pageToken: IMockTokenTable;
}

const buildPrisma = (): IMockPrisma => ({
  pageDefinition: {
    create: vi.fn(async ({ data }) => ({
      id: data.id,
      baseId: data.baseId,
      name: data.name,
      slug: data.slug,
      blocksJson: data.blocksJson,
      visibility: data.visibility,
      themeJson: data.themeJson,
      publishedAt: null,
      createdBy: data.createdBy,
      createdTime: new Date(),
      updatedTime: new Date(),
    })),
    update: vi.fn(async ({ where, data }) => ({
      id: where.id,
      baseId: 'b1',
      name: data.name ?? 'name',
      slug: data.slug ?? 'slug',
      blocksJson: data.blocksJson ?? '[]',
      visibility: data.visibility ?? 'authenticated',
      themeJson: data.themeJson ?? null,
      publishedAt: data.publishedAt ?? null,
      createdBy: 'u1',
      createdTime: new Date(),
      updatedTime: new Date(),
    })),
    delete: vi.fn(async () => undefined),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
  },
  pageToken: {
    create: vi.fn(async ({ data }) => data),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async () => null),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
});

describe('PageDesignerAuthService (Stage 28)', () => {
  let prisma: IMockPrisma;
  let svc: PageDesignerAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new PageDesignerAuthService(prisma as never);
  });

  describe('create', () => {
    it('persists a page with serialized blocks', async () => {
      const out = await svc.create({
        baseId: 'b1',
        name: 'My Page',
        slug: 'my-page',
        createdBy: 'u1',
        blocks: [
          { id: 'b1', type: 'heading', text: 'Hi', level: 1, order: 0 },
          { id: 'b2', type: 'view', viewId: 'v1', order: 1 },
        ],
      });
      expect(out.slug).toBe('my-page');
      expect(out.blocks).toHaveLength(2);
      expect(prisma.pageDefinition.create).toHaveBeenCalledTimes(1);
    });

    it('rejects bad slug', async () => {
      await expect(
        svc.create({ baseId: 'b', name: 'N', slug: 'BAD', createdBy: 'u', blocks: [] })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate slug', async () => {
      prisma.pageDefinition.findUnique.mockResolvedValueOnce({ id: 'pg_x', slug: 'my-page' });
      await expect(
        svc.create({ baseId: 'b', name: 'N', slug: 'my-page', createdBy: 'u', blocks: [] })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects invalid block', async () => {
      await expect(
        svc.create({
          baseId: 'b',
          name: 'N',
          slug: 'ok',
          createdBy: 'u',
          blocks: [{ id: 'x', type: 'view', order: 0 } as never],
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('throws when page is missing', async () => {
      await expect(svc.update('pg_x', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('renumbers blocks when supplied', async () => {
      prisma.pageDefinition.findUnique.mockResolvedValueOnce({
        id: 'pg_1',
        baseId: 'b1',
        name: 'n',
        slug: 's',
        blocksJson: '[]',
        visibility: 'authenticated',
        themeJson: null,
        publishedAt: null,
        createdBy: 'u1',
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      await svc.update('pg_1', {
        blocks: [
          { id: 'z', type: 'divider', order: 5 },
          { id: 'y', type: 'divider', order: 1 },
        ],
      });
      const updateArg = prisma.pageDefinition.update.mock.calls[0][0].data;
      expect(updateArg.blocksJson).toContain('"order":0');
      expect(updateArg.blocksJson).toContain('"order":1');
    });

    it('rejects invalid block payload', async () => {
      prisma.pageDefinition.findUnique.mockResolvedValueOnce({
        id: 'pg_1',
        baseId: 'b1',
        name: 'n',
        slug: 's',
        blocksJson: '[]',
        visibility: 'authenticated',
        themeJson: null,
        publishedAt: null,
        createdBy: 'u1',
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      await expect(
        svc.update('pg_1', { blocks: [{ id: 'x', type: 'view', order: 0 } as never] })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('publish / unpublish / delete', () => {
    it('publish sets publishedAt', async () => {
      prisma.pageDefinition.update.mockResolvedValueOnce({
        id: 'pg_1',
        baseId: 'b1',
        name: 'n',
        slug: 's',
        blocksJson: '[]',
        visibility: 'authenticated',
        themeJson: null,
        publishedAt: new Date('2026-08-25T00:00:00Z'),
        createdBy: 'u1',
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      const out = await svc.publish('pg_1');
      expect(out.publishedAt).not.toBeNull();
    });

    it('unpublish clears publishedAt', async () => {
      prisma.pageDefinition.update.mockResolvedValueOnce({
        id: 'pg_1',
        baseId: 'b1',
        name: 'n',
        slug: 's',
        blocksJson: '[]',
        visibility: 'authenticated',
        themeJson: null,
        publishedAt: null,
        createdBy: 'u1',
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      const out = await svc.unpublish('pg_1');
      expect(out.publishedAt).toBeNull();
    });

    it('delete removes page + tokens', async () => {
      const ok = await svc.delete('pg_1');
      expect(ok).toBe(true);
      expect(prisma.pageDefinition.delete).toHaveBeenCalled();
      expect(prisma.pageToken.deleteMany).toHaveBeenCalled();
    });
  });

  describe('link tokens', () => {
    it('mints a link token for link pages', async () => {
      prisma.pageDefinition.findUnique.mockResolvedValueOnce({
        id: 'pg_1',
        baseId: 'b1',
        name: 'n',
        slug: 's',
        blocksJson: '[]',
        visibility: 'link',
        themeJson: null,
        publishedAt: null,
        createdBy: 'u1',
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      const out = await svc.mintLinkToken({ pageId: 'pg_1', ttlSeconds: 60 });
      expect(out.token).toMatch(/^pg_/);
      expect(out.expiresAt).not.toBeNull();
    });

    it('rejects link token for authenticated pages', async () => {
      prisma.pageDefinition.findUnique.mockResolvedValueOnce({
        id: 'pg_1',
        baseId: 'b1',
        name: 'n',
        slug: 's',
        blocksJson: '[]',
        visibility: 'authenticated',
        themeJson: null,
        publishedAt: null,
        createdBy: 'u1',
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      await expect(svc.mintLinkToken({ pageId: 'pg_1' })).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('revokes an existing token', async () => {
      prisma.pageToken.findUnique.mockResolvedValueOnce({ id: 't1', revokedAt: null });
      const ok = await svc.revokeLinkToken('t1');
      expect(ok).toBe(true);
    });

    it('returns false when token missing or already revoked', async () => {
      prisma.pageToken.findUnique.mockResolvedValueOnce(null);
      expect(await svc.revokeLinkToken('t1')).toBe(false);
      prisma.pageToken.findUnique.mockResolvedValueOnce({ id: 't1', revokedAt: new Date() });
      expect(await svc.revokeLinkToken('t1')).toBe(false);
    });
  });

  describe('resolve', () => {
    it('returns not-found for unknown slug', async () => {
      const r = await svc.resolve({ slug: 'nope', caller: { authenticated: true, role: 'owner' } });
      expect(r.visibility.reason).toBe('page-not-found');
    });

    it('public pages are always allowed', async () => {
      prisma.pageDefinition.findUnique.mockResolvedValueOnce({
        id: 'pg_1',
        baseId: 'b1',
        name: 'n',
        slug: 's',
        blocksJson: '[]',
        visibility: 'public',
        themeJson: null,
        publishedAt: null,
        createdBy: 'u1',
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      const r = await svc.resolve({ slug: 's', caller: { authenticated: false, role: null } });
      expect(r.visibility.allowed).toBe(true);
      expect(r.visibility.reason).toBe('public');
    });

    it('link pages need a valid token', async () => {
      prisma.pageDefinition.findUnique.mockResolvedValueOnce({
        id: 'pg_1',
        baseId: 'b1',
        name: 'n',
        slug: 's',
        blocksJson: '[]',
        visibility: 'link',
        themeJson: null,
        publishedAt: null,
        createdBy: 'u1',
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      const r = await svc.resolve({
        slug: 's',
        caller: { authenticated: true, role: 'viewer', presentedToken: 'pg_x' },
      });
      expect(r.visibility.allowed).toBe(false);
    });

    it('link pages allow with a valid token', async () => {
      prisma.pageDefinition.findUnique.mockResolvedValueOnce({
        id: 'pg_1',
        baseId: 'b1',
        name: 'n',
        slug: 's',
        blocksJson: '[]',
        visibility: 'link',
        themeJson: null,
        publishedAt: null,
        createdBy: 'u1',
        createdTime: new Date(),
        updatedTime: new Date(),
      });
      const raw = 'pg_real';
      prisma.pageToken.findFirst.mockResolvedValueOnce({
        id: 't1',
        pageId: 'pg_1',
        token: hashPageToken(raw),
        expiresAt: null,
        revokedAt: null,
        createdTime: new Date(),
      });
      const r = await svc.resolve({
        slug: 's',
        caller: { authenticated: true, role: 'viewer', presentedToken: raw },
      });
      expect(r.visibility.allowed).toBe(true);
      expect(r.visibility.reason).toBe('link-token');
    });
  });
});
