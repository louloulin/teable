/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { ByokLlmAuthService } from './byok-llm.auth.service';
import type { ILlmProviderKey } from './byok-llm.types';

function mkPrismaMock() {
  const findUnique = vi.fn();
  const findMany = vi.fn();
  const upsert = vi.fn();
  const count = vi.fn();
  const create = vi.fn();
  const prisma = {
    byokLlmKey: {
      findUnique,
      findMany,
      upsert,
      count,
    },
    byokLlmUsage: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    byokLlmAttempt: {
      create,
      findMany: vi.fn(),
    },
  } as unknown as PrismaService;
  return { prisma, mocks: { findUnique, findMany, upsert, count, create } };
}

const baseKey: ILlmProviderKey = {
  id: 'k1',
  orgId: 'org1',
  provider: 'openai',
  alias: 'openai-primary',
  status: 'active',
  ciphertextRef: 'cipher:abc',
  fingerprint: 'abcd',
  verifiedAt: null,
  lastUsedAt: null,
  providerTpmCap: 0,
  orgDailyCap: 0,
  isolation: 'exclusive',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('ByokLlmAuthService', () => {
  it('validate() delegates to pure helpers', () => {
    const { prisma } = mkPrismaMock();
    const svc = new ByokLlmAuthService(prisma);
    expect(svc.validate(baseKey)).toEqual([]);
  });

  it('loadKey() returns null when missing', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.findUnique.mockResolvedValue(null);
    const svc = new ByokLlmAuthService(prisma);
    expect(await svc.loadKey('missing')).toBeNull();
  });

  it('loadKey() maps a row to domain', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.findUnique.mockResolvedValue({
      ...baseKey,
      verifiedAt: null,
      lastUsedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const svc = new ByokLlmAuthService(prisma);
    const k = await svc.loadKey('k1');
    expect(k?.provider).toBe('openai');
  });

  it('listKeys() returns mapped rows', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.findMany.mockResolvedValue([
      {
        ...baseKey,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new ByokLlmAuthService(prisma);
    const out = await svc.listKeys('org1');
    expect(out.length).toBe(1);
  });

  it('canRegister() returns false when at cap', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.count.mockResolvedValue(32);
    const svc = new ByokLlmAuthService(prisma);
    expect(await svc.canRegister('org1')).toBe(false);
  });

  it('disableKey() flips the status', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.findUnique.mockResolvedValue({
      ...baseKey,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    mocks.upsert.mockResolvedValue({});
    const svc = new ByokLlmAuthService(prisma);
    expect(await svc.disableKey('k1')).toBe(true);
    expect(mocks.upsert).toHaveBeenCalled();
  });

  it('disableKey() returns false when missing', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.findUnique.mockResolvedValue(null);
    const svc = new ByokLlmAuthService(prisma);
    expect(await svc.disableKey('missing')).toBe(false);
  });

  it('registerKey() rejects when org at cap', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.count.mockResolvedValue(32);
    const svc = new ByokLlmAuthService(prisma);
    await expect(
      svc.registerKey({
        orgId: 'org1',
        provider: 'openai',
        friendlyName: 'main',
        plaintext: 'sk-1234abcd',
        ciphertextRef: 'cipher:abc',
      })
    ).rejects.toThrow();
  });

  it('suggestAlias() delegates', () => {
    const { prisma } = mkPrismaMock();
    const svc = new ByokLlmAuthService(prisma);
    expect(svc.suggestAlias({ provider: 'openai', friendlyName: 'Main' })).toBe('openai-main');
  });
});
