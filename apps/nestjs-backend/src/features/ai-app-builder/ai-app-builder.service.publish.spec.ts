/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAppBuilderService } from './ai-app-builder.service';
import { HttpErrorCode } from '@teable/core';

interface IMockPrisma {
  appInstance: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}

const buildApp = (
  overrides: Partial<{
    id: string;
    baseId: string;
    currentVersionId: string | null;
    publicSlug: string | null;
    publishedAt: Date | null;
  }> = {}
) => ({
  id: 'app_1',
  baseId: 'bse_1',
  currentVersionId: 'apv_1' as string | null,
  publicSlug: null as string | null,
  publishedAt: null as Date | null,
  ...overrides,
});

describe('AiAppBuilderService (Round 45 publish + public URL)', () => {
  let prisma: IMockPrisma;
  let service: AiAppBuilderService;

  beforeEach(() => {
    prisma = {
      appInstance: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    service = new AiAppBuilderService(prisma as never);
  });

  // ─── publish ─────────────────────────────────────────────────────────────

  it('publishes a deployed app: generates a 12-char slug + writes publishedAt', async () => {
    prisma.appInstance.findUnique
      .mockResolvedValueOnce(buildApp({ publicSlug: null, publishedAt: null }))
      // generateUniquePublicSlug: try one slug, find none → return it
      .mockResolvedValueOnce(null);
    // Mock update to echo back the input slug so we can verify round-trip.
    prisma.appInstance.update.mockImplementationOnce(async ({ data }: { data: { publicSlug: string; publishedAt: Date } }) => ({
      id: 'app_1',
      publicSlug: data.publicSlug,
      publishedAt: data.publishedAt,
    }));

    const out = await service.publish('app_1');

    expect(out.id).toBe('app_1');
    expect(out.publicSlug).toMatch(/^[0-9a-z]{12}$/);
    expect(typeof out.publishedAt).toBe('string');
    expect(prisma.appInstance.update).toHaveBeenCalledTimes(1);
    expect(prisma.appInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'app_1' },
        data: expect.objectContaining({
          status: 'deployed',
        }),
      })
    );
    // The persisted slug is exactly the slug we returned to the caller.
    const updateArgs = prisma.appInstance.update.mock.calls[0][0] as {
      data: { publicSlug: string };
    };
    expect(updateArgs.data.publicSlug).toBe(out.publicSlug);
  });

  it('rejects publish when the app has no deployed version', async () => {
    prisma.appInstance.findUnique.mockResolvedValueOnce(
      buildApp({ currentVersionId: null })
    );

    await expect(service.publish('app_1')).rejects.toMatchObject({
      code: HttpErrorCode.VALIDATION_ERROR,
      message: expect.stringMatching(/no deployed version/),
    });
    expect(prisma.appInstance.update).not.toHaveBeenCalled();
  });

  it('is idempotent: re-publishing an already-published app returns the existing slug', async () => {
    const publishedAt = new Date('2026-09-02T00:00:00.000Z');
    prisma.appInstance.findUnique.mockResolvedValueOnce(
      buildApp({ publicSlug: 'abcdef123456', publishedAt })
    );

    const out = await service.publish('app_1');

    expect(out.publicSlug).toBe('abcdef123456');
    expect(out.publishedAt).toBe(publishedAt.toISOString());
    expect(prisma.appInstance.update).not.toHaveBeenCalled();
  });

  it('retries on slug collision up to MAX_TRIES times', async () => {
    prisma.appInstance.findUnique
      .mockResolvedValueOnce(buildApp({ publicSlug: null }))
      // first two attempts collide
      .mockResolvedValueOnce({ id: 'app_other' })
      .mockResolvedValueOnce({ id: 'app_other' })
      // third attempt succeeds
      .mockResolvedValueOnce(null);
    prisma.appInstance.update.mockResolvedValueOnce({
      id: 'app_1',
      publicSlug: 'z9y8x7w6v5u4',
      publishedAt: new Date('2026-09-03T00:00:00.000Z'),
    });

    const out = await service.publish('app_1');

    expect(out.publicSlug).toMatch(/^[0-9a-z]{12}$/);
    // 1 getApp + 3 slug-lookup tries = 4 findUnique calls
    expect(prisma.appInstance.findUnique).toHaveBeenCalledTimes(4);
  });

  it('throws after MAX_TRIES slug collisions', async () => {
    prisma.appInstance.findUnique
      .mockResolvedValueOnce(buildApp({ publicSlug: null }));
    // Return collision on every retry
    for (let i = 0; i < 6; i += 1) {
      prisma.appInstance.findUnique.mockResolvedValueOnce({ id: 'app_other' });
    }

    await expect(service.publish('app_1')).rejects.toThrow(
      /failed to generate unique public slug/
    );
    expect(prisma.appInstance.update).not.toHaveBeenCalled();
  });

  // ─── unpublish ───────────────────────────────────────────────────────────

  it('unpublishes a published app: clears slug + publishedAt + status', async () => {
    prisma.appInstance.findUnique.mockResolvedValueOnce(
      buildApp({ publicSlug: 'abcdef123456', publishedAt: new Date() })
    );
    prisma.appInstance.update.mockResolvedValueOnce({});

    const out = await service.unpublish('app_1');

    expect(out).toEqual({ id: 'app_1', unpublished: true });
    expect(prisma.appInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'app_1' },
        data: expect.objectContaining({
          publicSlug: null,
          publishedAt: null,
          status: 'draft',
        }),
      })
    );
  });

  it('is idempotent: unpublishing an unpublished app is a no-op', async () => {
    prisma.appInstance.findUnique.mockResolvedValueOnce(
      buildApp({ publicSlug: null })
    );

    const out = await service.unpublish('app_1');

    expect(out).toEqual({ id: 'app_1', unpublished: true });
    expect(prisma.appInstance.update).not.toHaveBeenCalled();
  });

  // ─── getPublicUrl ────────────────────────────────────────────────────────

  it('returns { published: false } when the app has no slug', async () => {
    prisma.appInstance.findUnique.mockResolvedValueOnce(
      buildApp({ publicSlug: null })
    );

    const out = await service.getPublicUrl('app_1');

    expect(out).toEqual({ published: false });
  });

  it('returns the composed URL when published (default APP_PUBLIC_HOST)', async () => {
    const originalHost = process.env.APP_PUBLIC_HOST;
    delete process.env.APP_PUBLIC_HOST;
    try {
      prisma.appInstance.findUnique.mockResolvedValueOnce({
        publicSlug: 'a1b2c3d4e5f6',
        publishedAt: new Date('2026-09-03T00:00:00.000Z'),
      });

      const out = await service.getPublicUrl('app_1');

      expect(out).toMatchObject({
        published: true,
        publicSlug: 'a1b2c3d4e5f6',
        url: 'http://localhost:3000/a/a1b2c3d4e5f6',
      });
      expect(out).not.toHaveProperty('publishedAt: 2026');
    } finally {
      if (originalHost === undefined) delete process.env.APP_PUBLIC_HOST;
      else process.env.APP_PUBLIC_HOST = originalHost;
    }
  });

  it('honors APP_PUBLIC_HOST env (with trailing slash stripped)', async () => {
    const originalHost = process.env.APP_PUBLIC_HOST;
    process.env.APP_PUBLIC_HOST = 'https://app.teable.ai/';
    try {
      prisma.appInstance.findUnique.mockResolvedValueOnce({
        publicSlug: 'a1b2c3d4e5f6',
        publishedAt: new Date('2026-09-03T00:00:00.000Z'),
      });

      const out = await service.getPublicUrl('app_1');

      expect(out).toMatchObject({
        url: 'https://app.teable.ai/a/a1b2c3d4e5f6',
      });
    } finally {
      if (originalHost === undefined) delete process.env.APP_PUBLIC_HOST;
      else process.env.APP_PUBLIC_HOST = originalHost;
    }
  });

  it('throws 404 when the app does not exist', async () => {
    prisma.appInstance.findUnique.mockResolvedValueOnce(null);

    await expect(service.getPublicUrl('app_missing')).rejects.toMatchObject({
      code: HttpErrorCode.NOT_FOUND,
    });
  });

  // ─── resolveBySlug ───────────────────────────────────────────────────────

  it('resolves a published app by slug', async () => {
    const publishedAt = new Date('2026-09-03T00:00:00.000Z');
    prisma.appInstance.findUnique.mockResolvedValueOnce({
      id: 'app_1',
      baseId: 'bse_1',
      currentVersionId: 'apv_1',
      publicSlug: 'a1b2c3d4e5f6',
      publishedAt,
    });

    const out = await service.resolveBySlug('a1b2c3d4e5f6');

    expect(out).toEqual({
      id: 'app_1',
      baseId: 'bse_1',
      currentVersionId: 'apv_1',
      publicSlug: 'a1b2c3d4e5f6',
      publishedAt,
    });
  });

  it('returns null for an unknown slug', async () => {
    prisma.appInstance.findUnique.mockResolvedValueOnce(null);

    expect(await service.resolveBySlug('unknownslug')).toBeNull();
  });

  it('returns null when the slug row exists but is unpublished', async () => {
    prisma.appInstance.findUnique.mockResolvedValueOnce({
      id: 'app_1',
      baseId: 'bse_1',
      currentVersionId: 'apv_1',
      publicSlug: 'a1b2c3d4e5f6',
      publishedAt: null,
    });

    expect(await service.resolveBySlug('a1b2c3d4e5f6')).toBeNull();
  });
});
