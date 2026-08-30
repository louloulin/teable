import { BadRequestException } from '@nestjs/common';
import { vi } from 'vitest';

import { TotpAuthService } from './totp.auth.service';
import { hashBackupCode, generateSecret, totp } from './totp.service';

interface IMockBackupCode {
  id: string;
  codeHash: string;
  usedAt: Date | null;
}
interface IMockFactor {
  id: string;
  userId: string;
  label: string;
  secret: string;
  algorithm: string;
  digits: number;
  period: number;
  lastCounter: bigint;
  enabled: boolean;
  backupCodes: IMockBackupCode[];
}
interface IMockUserTotpFactor {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
}
interface IMockUserTotpBackupCode {
  update: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  userTotpFactor: IMockUserTotpFactor;
  userTotpBackupCode: IMockUserTotpBackupCode;
}

const buildPrisma = (): IMockPrisma => ({
  userTotpFactor: {
    create: vi.fn(async ({ data }) => data),
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => null),
    update: vi.fn(async ({ where, data }) => ({ ...data, id: where.id })),
    count: vi.fn(async () => 0),
  },
  userTotpBackupCode: {
    update: vi.fn(async ({ where, data }) => ({ ...data, id: where.id })),
    count: vi.fn(async () => 0),
  },
});

describe('TotpAuthService (Stage 22)', () => {
  let prisma: IMockPrisma;
  let svc: TotpAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new TotpAuthService(prisma as never);
  });

  describe('beginEnrollment', () => {
    it('returns secret + otpauth URI + backup codes, no DB writes', async () => {
      const out = await svc.beginEnrollment({ userId: 'u1', label: 'iPhone', issuer: 'Acme' });
      expect(out.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(out.otpauthUri).toContain('otpauth://totp/');
      expect(out.backupCodes).toHaveLength(10);
      expect(prisma.userTotpFactor.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmEnrollment', () => {
    it('persists factor + backup codes when the code matches', async () => {
      const { secret, otpauthUri, backupCodes, factorId } = await svc.beginEnrollment({
        userId: 'u1',
        label: 'iPhone',
        issuer: 'Acme',
      });
      const code = totp({ secret, digits: 6, period: 30, algorithm: 'SHA1' }, Date.now());
      await svc.confirmEnrollment({
        userId: 'u1',
        factorId,
        secret,
        label: 'iPhone',
        code,
        issuer: 'Acme',
        backupCodes,
      });
      expect(prisma.userTotpFactor.create).toHaveBeenCalledTimes(1);
      const arg = prisma.userTotpFactor.create.mock.calls[0][0];
      expect(arg.data.id).toBe(factorId);
      expect(arg.data.backupCodes.create).toHaveLength(10);
      expect(otpauthUri).toContain('otpauth://totp/');
    });

    it('rejects when the supplied code does not match', async () => {
      const { secret, backupCodes, factorId } = await svc.beginEnrollment({
        userId: 'u1',
        label: 'iPhone',
        issuer: 'Acme',
      });
      await expect(
        svc.confirmEnrollment({
          userId: 'u1',
          factorId,
          secret,
          label: 'iPhone',
          code: '000000',
          issuer: 'Acme',
          backupCodes,
        })
      ).rejects.toThrow(/did not match/);
      expect(prisma.userTotpFactor.create).not.toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    it('accepts a TOTP code and advances lastCounter', async () => {
      const secret = generateSecret(20);
      const code = totp({ secret, digits: 6, period: 30, algorithm: 'SHA1' }, Date.now());
      prisma.userTotpFactor.findMany.mockResolvedValueOnce([
        {
          id: 'f1',
          userId: 'u1',
          label: 'iPhone',
          secret,
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          lastCounter: 0n,
          enabled: true,
          backupCodes: [],
        },
      ]);
      const out = await svc.verify({ userId: 'u1', code });
      expect(out?.factorId).toBe('f1');
      expect(out?.consumedBackupCode).toBe(false);
      expect(prisma.userTotpFactor.update).toHaveBeenCalledTimes(1);
    });

    it('returns null when no factor is registered', async () => {
      prisma.userTotpFactor.findMany.mockResolvedValueOnce([]);
      expect(await svc.verify({ userId: 'u1', code: '123456' })).toBeNull();
    });

    it('returns null when the code does not match any factor', async () => {
      prisma.userTotpFactor.findMany.mockResolvedValueOnce([
        {
          id: 'f1',
          userId: 'u1',
          label: 'iPhone',
          secret: generateSecret(20),
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          lastCounter: 0n,
          enabled: true,
          backupCodes: [],
        },
      ]);
      expect(await svc.verify({ userId: 'u1', code: '000000' })).toBeNull();
    });

    it('consumes a backup code and reports remaining count', async () => {
      const backupCode = 'abcdefgh';
      const codeHash = hashBackupCode(backupCode);
      prisma.userTotpFactor.findMany.mockResolvedValueOnce([
        {
          id: 'f1',
          userId: 'u1',
          label: 'iPhone',
          secret: generateSecret(20),
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          lastCounter: 0n,
          enabled: true,
          backupCodes: [{ id: 'bc1', codeHash, usedAt: null }],
        },
      ]);
      prisma.userTotpBackupCode.count.mockResolvedValueOnce(3);
      const out = await svc.verify({ userId: 'u1', code: '000000', backupCode });
      expect(out?.consumedBackupCode).toBe(true);
      expect(out?.remainingBackupCodes).toBe(3);
      expect(prisma.userTotpBackupCode.update).toHaveBeenCalledWith({
        where: { id: 'bc1' },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('rejects backup code that does not hash to any row', async () => {
      prisma.userTotpFactor.findMany.mockResolvedValueOnce([
        {
          id: 'f1',
          userId: 'u1',
          label: 'iPhone',
          secret: generateSecret(20),
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          lastCounter: 0n,
          enabled: true,
          backupCodes: [],
        },
      ]);
      expect(
        await svc.verify({ userId: 'u1', code: '000000', backupCode: 'wrongcode' })
      ).toBeNull();
    });
  });

  describe('disable', () => {
    it('soft-disables the factor (cascade-deletes its backup codes via FK)', async () => {
      prisma.userTotpFactor.findUnique.mockResolvedValueOnce({
        id: 'f1',
        userId: 'u1',
      });
      await svc.disable({ userId: 'u1', factorId: 'f1' });
      expect(prisma.userTotpFactor.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: { enabled: false },
      });
    });

    it('throws when the factor is not owned by the user', async () => {
      prisma.userTotpFactor.findUnique.mockResolvedValueOnce({ id: 'f1', userId: 'someone_else' });
      await expect(svc.disable({ userId: 'u1', factorId: 'f1' })).rejects.toBeInstanceOf(
        BadRequestException
      );
    });
  });

  describe('isEnabled', () => {
    it('returns true when at least one enabled factor exists', async () => {
      prisma.userTotpFactor.count.mockResolvedValueOnce(2);
      expect(await svc.isEnabled('u1')).toBe(true);
    });

    it('returns false when no enabled factor exists', async () => {
      prisma.userTotpFactor.count.mockResolvedValueOnce(0);
      expect(await svc.isEnabled('u1')).toBe(false);
    });
  });
});
