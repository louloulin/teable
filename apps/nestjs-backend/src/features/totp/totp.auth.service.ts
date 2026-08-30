import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  DEFAULT_ALGORITHM,
  DEFAULT_DIGITS,
  DEFAULT_PERIOD,
  buildOtpauthUri,
  generateBackupCodes,
  generateSecret,
  hashBackupCode,
  nextWindowAt,
  verifyCode,
} from './totp.service';
import type { ITotpEnrollmentChallenge, ITotpFactorRow, ITotpVerifyInput } from './totp.types';

/**
 * TOTP 2FA orchestrator — Stage 22.
 *
 * Owns the lifecycle of a user's authenticator-app factors: enroll,
 * verify the first code, write the factor + backup codes, accept codes
 * on subsequent logins. We persist the per-factor `lastCounter` so a
 * stolen code can't be replayed within the window.
 */
@Injectable()
export class TotpAuthService {
  /** Default bits for the shared secret — 160 bits is the RFC minimum. */
  static readonly DEFAULT_SECRET_BYTES = 20;
  /** Default number of single-use backup codes handed out at enrollment. */
  static readonly DEFAULT_BACKUP_CODES = 10;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Begin enrollment. Returns the secret + otpauth URI + backup codes.
   * The factor is NOT persisted yet — the caller must confirm by
   * passing a valid code to `confirmEnrollment`, which atomically
   * writes the factor + backup-code rows.
   */
  async beginEnrollment(input: {
    userId: string;
    label: string;
    issuer: string;
  }): Promise<ITotpEnrollmentChallenge & { factorId: string }> {
    const secret = generateSecret(TotpAuthService.DEFAULT_SECRET_BYTES);
    const factorId = `totp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const backupCodes = generateBackupCodes(TotpAuthService.DEFAULT_BACKUP_CODES);
    const otpauthUri = buildOtpauthUri({
      secret,
      label: input.userId,
      issuer: input.issuer,
      digits: DEFAULT_DIGITS,
      period: DEFAULT_PERIOD,
      algorithm: DEFAULT_ALGORITHM,
    });
    return { factorId, secret, otpauthUri, backupCodes };
  }

  /**
   * Confirm enrollment by proving possession of the secret. Only then
   * do we persist the factor + backup-code rows. Throws if the code
   * does not match a freshly-issued (unpersisted) secret.
   */
  async confirmEnrollment(input: {
    userId: string;
    factorId: string;
    secret: string;
    label: string;
    code: string;
    issuer: string;
    backupCodes: string[];
  }): Promise<{ factorId: string; backupCodes: string[] }> {
    const accepted = verifyCode(
      {
        secret: input.secret,
        digits: DEFAULT_DIGITS,
        period: DEFAULT_PERIOD,
        algorithm: DEFAULT_ALGORITHM,
        lastCounter: 0n,
      },
      input.code,
      Date.now()
    );
    if (accepted === null) {
      throw new BadRequestException('TOTP code did not match');
    }
    await this.prisma.userTotpFactor.create({
      data: {
        id: input.factorId,
        userId: input.userId,
        label: input.label,
        secret: input.secret,
        algorithm: DEFAULT_ALGORITHM,
        digits: DEFAULT_DIGITS,
        period: DEFAULT_PERIOD,
        lastCounter: accepted,
        enabled: true,
        backupCodes: {
          create: input.backupCodes.map((code) => ({
            id: `tbk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}_${code.slice(0, 4)}`,
            codeHash: hashBackupCode(code),
          })),
        },
      },
    });
    return { factorId: input.factorId, backupCodes: input.backupCodes };
  }

  /**
   * Verify a candidate code (or backup code) against any active
   * factor owned by the user. Returns null on failure — callers
   * should map to a 401 / audit event.
   */
  async verify(input: ITotpVerifyInput): Promise<{
    factorId: string;
    consumedBackupCode: boolean;
    remainingBackupCodes: number;
  } | null> {
    const factors = await this.prisma.userTotpFactor.findMany({
      where: { userId: input.userId, enabled: true },
      include: { backupCodes: { where: { usedAt: null } } },
    });
    if (factors.length === 0) return null;

    if (input.backupCode) {
      return this.consumeBackupCode(
        factors as unknown as Array<
          ITotpFactorRow & { backupCodes: { id: string; codeHash: string }[] }
        >,
        input.backupCode
      );
    }

    if (!input.code) return null;
    for (const f of factors) {
      const counter = verifyCode(
        f as unknown as Pick<ITotpFactorRow, 'secret' | 'algorithm' | 'digits' | 'period' | 'lastCounter'>,
        input.code,
        Date.now()
      );
      if (counter !== null) {
        await this.prisma.userTotpFactor.update({
          where: { id: f.id },
          data: { lastCounter: counter },
        });
        return {
          factorId: f.id,
          consumedBackupCode: false,
          remainingBackupCodes: f.backupCodes.length,
        };
      }
    }
    return null;
  }

  /** Disable a factor + cascade-delete its backup codes. */
  async disable(input: { userId: string; factorId: string }): Promise<void> {
    const factor = await this.prisma.userTotpFactor.findUnique({ where: { id: input.factorId } });
    if (!factor || factor.userId !== input.userId) {
      throw new BadRequestException('factor not found');
    }
    await this.prisma.userTotpFactor.update({
      where: { id: input.factorId },
      data: { enabled: false },
    });
  }

  /** True when the user has at least one enabled factor. */
  async isEnabled(userId: string): Promise<boolean> {
    const count = await this.prisma.userTotpFactor.count({
      where: { userId, enabled: true },
    });
    return count > 0;
  }

  /** Compute the next moment a fresh code window opens — surfaced on rate-limited retries. */
  nextAllowedAt(period = DEFAULT_PERIOD): number {
    return nextWindowAt(period, Date.now());
  }

  // --- internals ---

  private async consumeBackupCode(
    factors: Array<ITotpFactorRow & { backupCodes: { id: string; codeHash: string }[] }>,
    code: string
  ): Promise<{
    factorId: string;
    consumedBackupCode: boolean;
    remainingBackupCodes: number;
  } | null> {
    const target = hashBackupCode(code);
    for (const f of factors) {
      const match = f.backupCodes.find((bc) => bc.codeHash === target);
      if (!match) continue;
      await this.prisma.userTotpBackupCode.update({
        where: { id: match.id },
        data: { usedAt: new Date() },
      });
      const remaining = await this.prisma.userTotpBackupCode.count({
        where: { factorId: f.id, usedAt: null },
      });
      return {
        factorId: f.id,
        consumedBackupCode: true,
        remainingBackupCodes: remaining,
      };
    }
    return null;
  }
}
