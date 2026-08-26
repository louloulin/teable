/* eslint-disable @typescript-eslint/naming-convention */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

import { ByokKmsAuthService, LocalMasterKeyProvider } from './byok-kms.auth.service';
import { generateDek } from './byok-kms.service';

interface IMockKeyTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockAuditTable {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  customerKmsKey: IMockKeyTable;
  kmsAuditEntry: IMockAuditTable;
}

const now = new Date('2026-08-25T00:00:00Z');

const buildPrisma = (): IMockPrisma => ({
  customerKmsKey: {
    create: vi.fn(async ({ data }) => ({
      id: data.id,
      ...data,
      createdTime: now,
      updatedTime: now,
      lastUsedAt: null,
    })),
    update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data, updatedTime: now })),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
  },
  kmsAuditEntry: {
    create: vi.fn(async ({ data }) => ({ id: data.id, ...data, atTime: now })),
    findMany: vi.fn(async () => []),
  },
});

const baseInput = {
  organizationId: 'o1',
  alias: 'data-key',
  provider: 'local' as const,
  keyId: 'k1',
  keyVersion: 'v1',
  createdBy: 'u1',
};

describe('ByokKmsAuthService (Stage 35)', () => {
  let prisma: IMockPrisma;
  let provider: LocalMasterKeyProvider;
  let svc: ByokKmsAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    provider = new LocalMasterKeyProvider(generateDek());
    provider.registerMaterial('k1', generateDek());
    svc = new ByokKmsAuthService(prisma as never, provider);
  });

  describe('registerKey', () => {
    it('registers a new key', async () => {
      const out = await svc.registerKey(baseInput);
      expect(out.alias).toBe('data-key');
      expect(out.status).toBe('enabled');
    });

    it('rejects bad alias', async () => {
      await expect(svc.registerKey({ ...baseInput, alias: 'X' })).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('rejects duplicate alias', async () => {
      prisma.customerKmsKey.findFirst.mockResolvedValueOnce({ id: 'kms_x', alias: 'data-key' });
      await expect(svc.registerKey(baseInput)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('disableKey / rotateKey', () => {
    it('disables an enabled key', async () => {
      prisma.customerKmsKey.findFirst.mockResolvedValueOnce({
        id: 'kms_1',
        organizationId: 'o1',
        alias: 'data-key',
        provider: 'local',
        keyId: 'k1',
        keyVersion: 'v1',
        status: 'enabled',
        rotationPolicyJson: null,
        createdBy: 'u1',
        createdTime: now,
        updatedTime: now,
        lastUsedAt: null,
      });
      prisma.customerKmsKey.update.mockResolvedValueOnce({
        id: 'kms_1',
        organizationId: 'o1',
        alias: 'data-key',
        provider: 'local',
        keyId: 'k1',
        keyVersion: 'v1',
        status: 'disabled',
        rotationPolicyJson: null,
        createdBy: 'u1',
        createdTime: now,
        updatedTime: now,
        lastUsedAt: null,
      });
      const out = await svc.disableKey('o1', 'data-key');
      expect(out.status).toBe('disabled');
    });

    it('rotates an enabled key', async () => {
      prisma.customerKmsKey.findFirst.mockResolvedValueOnce({
        id: 'kms_1',
        organizationId: 'o1',
        alias: 'data-key',
        provider: 'local',
        keyId: 'k1',
        keyVersion: 'v1',
        status: 'enabled',
        rotationPolicyJson: null,
        createdBy: 'u1',
        createdTime: now,
        updatedTime: now,
        lastUsedAt: null,
      });
      prisma.customerKmsKey.update.mockResolvedValueOnce({
        id: 'kms_1',
        organizationId: 'o1',
        alias: 'data-key',
        provider: 'local',
        keyId: 'k1',
        keyVersion: 'v2',
        status: 'enabled',
        rotationPolicyJson: null,
        createdBy: 'u1',
        createdTime: now,
        updatedTime: now,
        lastUsedAt: null,
      });
      const out = await svc.rotateKey({
        organizationId: 'o1',
        alias: 'data-key',
        newKeyVersion: 'v2',
      });
      expect(out.keyVersion).toBe('v2');
    });

    it('rejects rotating a disabled key', async () => {
      prisma.customerKmsKey.findFirst.mockResolvedValueOnce({
        id: 'kms_1',
        organizationId: 'o1',
        alias: 'data-key',
        provider: 'local',
        keyId: 'k1',
        keyVersion: 'v1',
        status: 'disabled',
        rotationPolicyJson: null,
        createdBy: 'u1',
        createdTime: now,
        updatedTime: now,
        lastUsedAt: null,
      });
      await expect(
        svc.rotateKey({ organizationId: 'o1', alias: 'data-key', newKeyVersion: 'v2' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('encryptForOrg / decryptForOrg', () => {
    const setupKey = (status = 'enabled') => {
      prisma.customerKmsKey.findFirst.mockResolvedValue({
        id: 'kms_1',
        organizationId: 'o1',
        alias: 'data-key',
        provider: 'local',
        keyId: 'k1',
        keyVersion: 'v1',
        status,
        rotationPolicyJson: null,
        createdBy: 'u1',
        createdTime: now,
        updatedTime: now,
        lastUsedAt: null,
      });
    };

    it('round-trips plaintext', async () => {
      setupKey();
      const plaintext = Buffer.from('hello byok!');
      const { ciphertext, envelope } = await svc.encryptForOrg({
        organizationId: 'o1',
        alias: 'data-key',
        plaintext,
      });
      expect(envelope.algorithm).toBe('AES-256-GCM');
      const out = await svc.decryptForOrg({
        organizationId: 'o1',
        alias: 'data-key',
        ciphertext,
        envelope,
      });
      expect(out.equals(plaintext)).toBe(true);
    });

    it('rejects encrypting with a missing key', async () => {
      await expect(
        svc.encryptForOrg({ organizationId: 'o1', alias: 'nope', plaintext: Buffer.from('x') })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects encrypting with a disabled key', async () => {
      setupKey('disabled');
      await expect(
        svc.encryptForOrg({ organizationId: 'o1', alias: 'data-key', plaintext: Buffer.from('x') })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects decrypting with mismatched envelope keyId', async () => {
      setupKey();
      const plaintext = Buffer.from('x');
      const { ciphertext, envelope } = await svc.encryptForOrg({
        organizationId: 'o1',
        alias: 'data-key',
        plaintext,
      });
      await expect(
        svc.decryptForOrg({
          organizationId: 'o1',
          alias: 'data-key',
          ciphertext,
          envelope: { ...envelope, keyId: 'other-key' },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('audit', () => {
    it('records an audit entry', async () => {
      const out = await svc.recordAudit({
        organizationId: 'o1',
        keyId: 'k1',
        operation: 'wrap',
        callerType: 'service',
        callerId: 'svc_1',
      });
      expect(out.operation).toBe('wrap');
    });

    it('lists audit entries', async () => {
      prisma.kmsAuditEntry.findMany.mockResolvedValueOnce([
        {
          id: 'kmsa_1',
          organizationId: 'o1',
          keyId: 'k1',
          operation: 'wrap',
          callerType: 'service',
          callerId: null,
          payloadHash: null,
          atTime: now,
        },
      ]);
      const out = await svc.listAudit({ organizationId: 'o1' });
      expect(out).toHaveLength(1);
    });
  });
});
