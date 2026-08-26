/* eslint-disable @typescript-eslint/naming-convention */
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { KmsEncryptionAuthService } from './kms-encryption.auth.service';
import type { IKmsProvider } from './kms-encryption.service';

interface IMockKeyRow {
  id: string;
  kid: string;
  algorithm: string;
  alias: string | null;
  state: string;
  createdTime: Date;
  retiredAt: Date | null;
}

function mkKeyRow(over: Partial<IMockKeyRow> = {}): IMockKeyRow {
  return {
    id: 'ek_1',
    kid: 'kms-prod-1',
    algorithm: 'AES-256-GCM',
    alias: null,
    state: 'enabled',
    createdTime: new Date('2024-01-01T00:00:00Z'),
    retiredAt: null,
    ...over,
  };
}

function mkKmsProvider(): IKmsProvider {
  return {
    wrapDek: vi.fn(async (dek) => dek),
    unwrapDek: vi.fn(async (wrapped) => wrapped),
  };
}

function mkPrismaMock() {
  const create = vi.fn();
  const findMany = vi.fn();
  const findUnique = vi.fn();
  const update = vi.fn();
  const prisma = {
    encryptionKey: { create, findMany, findUnique, update },
  } as unknown as PrismaService;
  return { prisma, mocks: { create, findMany, findUnique, update } };
}

describe('KmsEncryptionAuthService', () => {
  describe('createKey', () => {
    it('persists a new key with default algorithm', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.create.mockResolvedValue(mkKeyRow({ id: 'ek_new', kid: 'kms-prod-2' }));
      const kms = mkKmsProvider();
      const svc = new KmsEncryptionAuthService(prisma, kms);

      const out = await svc.createKey({ kid: 'kms-prod-2' });
      expect(out.kid).toBe('kms-prod-2');
      expect(out.state).toBe('enabled');
      expect(out.algorithm).toBe('AES-256-GCM');
      expect(mocks.create).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid kid without hitting prisma', async () => {
      const { prisma } = mkPrismaMock();
      const svc = new KmsEncryptionAuthService(prisma, mkKmsProvider());
      await expect(svc.createKey({ kid: '' })).rejects.toThrow();
    });
  });

  describe('listKeys + getKey + findKeyByKid', () => {
    it('listKeys returns parsed rows', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findMany.mockResolvedValue([mkKeyRow(), mkKeyRow({ id: 'ek_2' })]);
      const svc = new KmsEncryptionAuthService(prisma, mkKmsProvider());
      const out = await svc.listKeys();
      expect(out).toHaveLength(2);
    });

    it('getKey throws NotFound when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findUnique.mockResolvedValue(null);
      const svc = new KmsEncryptionAuthService(prisma, mkKmsProvider());
      await expect(svc.getKey('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('findKeyByKid returns undefined when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findUnique.mockResolvedValue(null);
      const svc = new KmsEncryptionAuthService(prisma, mkKmsProvider());
      expect(await svc.findKeyByKid('nope')).toBeUndefined();
    });
  });

  describe('updateKeyState', () => {
    it('throws NotFound when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findUnique.mockResolvedValue(null);
      const svc = new KmsEncryptionAuthService(prisma, mkKmsProvider());
      await expect(svc.updateKeyState('nope', { state: 'disabled' })).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('rejects invalid state', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findUnique.mockResolvedValue(mkKeyRow());
      const svc = new KmsEncryptionAuthService(prisma, mkKmsProvider());
      await expect(svc.updateKeyState('ek_1', { state: 'archived' as never })).rejects.toThrow(
        /state/
      );
    });

    it('persists new state', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findUnique.mockResolvedValue(mkKeyRow());
      mocks.update.mockResolvedValue(mkKeyRow({ state: 'disabled' }));
      const svc = new KmsEncryptionAuthService(prisma, mkKmsProvider());
      const out = await svc.updateKeyState('ek_1', { state: 'disabled' });
      expect(out.state).toBe('disabled');
    });
  });

  describe('encrypt / decrypt', () => {
    it('encrypts + decrypts a small payload', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findMany.mockResolvedValue([mkKeyRow()]);
      const kms = mkKmsProvider();
      const svc = new KmsEncryptionAuthService(prisma, kms);
      const env = await svc.encrypt({ plaintext: 'hello' });
      expect(env.kid).toBe('kms-prod-1');
      expect(env.algorithm).toBe('AES-256-GCM');

      // Decrypt re-fetches keys from prisma (mocked).
      const decrypted = await svc.decrypt(env);
      expect(decrypted).toBe('hello');
    });

    it('encrypt picks the requested kid', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findMany.mockResolvedValue([
        mkKeyRow({ kid: 'kms-prod-1', createdTime: new Date('2024-01-01') }),
        mkKeyRow({ id: 'k2', kid: 'kms-prod-2', createdTime: new Date('2024-06-01') }),
      ]);
      const svc = new KmsEncryptionAuthService(prisma, mkKmsProvider());
      const env = await svc.encrypt({ plaintext: 'hi', kid: 'kms-prod-2' });
      expect(env.kid).toBe('kms-prod-2');
    });

    it('rejects encryption when no enabled key', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findMany.mockResolvedValue([mkKeyRow({ state: 'disabled' })]);
      const svc = new KmsEncryptionAuthService(prisma, mkKmsProvider());
      await expect(svc.encrypt({ plaintext: 'x' })).rejects.toThrow(/no enabled/);
    });

    it('rejects encryption when requested kid not enabled', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findMany.mockResolvedValue([mkKeyRow({ kid: 'kms-prod-1', state: 'disabled' })]);
      const svc = new KmsEncryptionAuthService(prisma, mkKmsProvider());
      await expect(svc.encrypt({ plaintext: 'x', kid: 'kms-prod-1' })).rejects.toThrow(
        /not enabled/
      );
    });

    it('decrypt rejects compromised key', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findMany.mockResolvedValue([mkKeyRow({ state: 'compromised' })]);
      const svc = new KmsEncryptionAuthService(prisma, mkKmsProvider());
      await expect(
        svc.decrypt({
          kid: 'kms-prod-1',
          iv: '',
          ciphertext: '',
          algorithm: 'AES-256-GCM',
        })
      ).rejects.toThrow(/compromised/);
    });
  });

  describe('exposed helpers', () => {
    it('exposes isValidAlgorithm / pickEncryptionKey / canDecryptWith / byteLengthUtf8', () => {
      const { prisma } = mkPrismaMock();
      const svc = new KmsEncryptionAuthService(prisma, mkKmsProvider());
      expect(svc.isValidAlgorithm('AES-256-GCM')).toBe(true);
      expect(svc.byteLengthUtf8('hi')).toBe(2);
    });
  });
});
