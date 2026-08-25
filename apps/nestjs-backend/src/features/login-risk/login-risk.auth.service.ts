/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Login risk — NestJS auth service (Stage 76).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { decideOutcome, evaluate, pushFingerprint } from './login-risk.service';
import type {
  ILoginAttempt,
  ILoginFingerprint,
  ILoginHistory,
  ILoginRiskOutput,
  LoginOutcome,
} from './login-risk.types';

@Injectable()
export class LoginRiskAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Evaluate a login attempt. */
  evaluate(input: {
    fingerprint: ILoginFingerprint;
    history: ILoginHistory;
    recentFailed: { occurredAt: string }[];
    now: string;
  }): ILoginRiskOutput {
    return evaluate(input);
  }

  /** Compose a final outcome. */
  decideOutcome(input: {
    policyAction: LoginOutcome | null;
    anomaly: ILoginRiskOutput;
  }): LoginOutcome {
    return decideOutcome(input);
  }

  /** Persist the attempt + bump the actor history. */
  async recordAttempt(input: {
    attempt: ILoginAttempt;
    history: ILoginHistory;
  }): Promise<ILoginHistory> {
    await this.prisma.loginAttempt.create({
      data: {
        id: input.attempt.id,
        orgId: input.attempt.orgId,
        actorId: input.attempt.actorId,
        deviceId: input.attempt.fingerprint.deviceId,
        ip: input.attempt.fingerprint.ip,
        countryCode: input.attempt.fingerprint.countryCode,
        regionCode: input.attempt.fingerprint.regionCode,
        tzOffsetMinutes: input.attempt.fingerprint.tzOffsetMinutes,
        userAgent: input.attempt.fingerprint.userAgent,
        outcome: input.attempt.outcome,
        band: input.attempt.band,
        failureReason: input.attempt.failureReason,
        occurredAt: new Date(input.attempt.occurredAt),
      },
    });
    return pushFingerprint({
      history: input.history,
      fp: input.attempt.fingerprint,
      outcome: input.attempt.outcome,
      now: input.attempt.occurredAt,
    });
  }

  /** Load the persisted history snapshot for an actor. */
  async loadHistory(actorId: string): Promise<ILoginHistory> {
    const rows = await this.prisma.loginAttempt.findMany({
      where: { actorId },
      orderBy: { occurredAt: 'asc' },
    });
    const recent: ILoginFingerprint[] = [];
    let lastSuccessAt: string | null = null;
    for (const r of rows) {
      const fp: ILoginFingerprint = {
        deviceId: String(r['deviceId']),
        ip: String(r['ip']),
        countryCode: String(r['countryCode']),
        regionCode: String(r['regionCode']),
        tzOffsetMinutes: Number(r['tzOffsetMinutes']),
        userAgent: String(r['userAgent']),
      };
      recent.push(fp);
      if (r['outcome'] === 'success' || r['outcome'] === 'mfa-challenge') {
        lastSuccessAt = new Date(String(r['occurredAt'])).toISOString();
      }
    }
    return { actorId, recent, failedCountByDay: {}, lastSuccessAt };
  }
}
