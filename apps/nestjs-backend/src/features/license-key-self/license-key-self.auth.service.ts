/* eslint-disable @typescript-eslint/naming-convention */
/**
 * License key self up/downgrade — NestJS auth service (Stage 82).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  appendAudit,
  buildAudit,
  cooldownStatus,
  nextCooldownFrom,
  prorationPreview,
  validateTierChange,
} from './license-key-self.service';
import type {
  ICooldownStatus,
  IProrationPreview,
  ITierChangeAudit,
  ITierChangeRequest,
} from './license-key-self.types';

@Injectable()
export class LicenseKeySelfAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a proposed change and return its proration preview. */
  async preview(input: {
    request: ITierChangeRequest;
    cycleStart: string;
    now: string;
  }): Promise<IProrationPreview> {
    const err = validateTierChange(input.request, input.now);
    if (err) throw new Error(`invalid tier change: ${err}`);
    return prorationPreview({
      from: input.request.from,
      to: input.request.to,
      cycleStart: input.cycleStart,
      effectiveAt: input.request.effectiveAt,
      now: input.now,
    });
  }

  /** Cooldown status for a license. */
  async cooldownFor(input: { licenseId: string; now: string }): Promise<ICooldownStatus> {
    const last = await this.prisma.licenseTierAudit.findFirst({
      where: { licenseId: input.licenseId },
      orderBy: { effectiveAt: 'desc' },
    });
    const lastChangeAt = last ? new Date(last.effectiveAt).toISOString() : undefined;
    return cooldownStatus(lastChangeAt, input.now);
  }

  /** Apply a tier change: persist and append audit. */
  async apply(input: { request: ITierChangeRequest; now: string }): Promise<ITierChangeAudit> {
    const err = validateTierChange(input.request, input.now);
    if (err) throw new Error(`invalid tier change: ${err}`);
    const cooldown = await this.cooldownFor({
      licenseId: input.request.licenseId,
      now: input.now,
    });
    if (!cooldown.canChange) {
      throw new Error(`cooldown active, next allowed at ${cooldown.nextAllowedAt}`);
    }
    await this.prisma.licenseKey.update({
      where: { id: input.request.licenseId },
      data: {
        tier: input.request.to,
        nextChangeAt: nextCooldownFrom(input.request.effectiveAt),
      },
    });
    const audit = buildAudit({
      id: `${input.request.licenseId}:${input.request.effectiveAt}`,
      request: input.request,
      createdAt: input.now,
    });
    await this.prisma.licenseTierAudit.create({
      data: {
        id: audit.id,
        licenseId: audit.licenseId,
        from: audit.from,
        to: audit.to,
        direction: audit.direction,
        effectiveAt: new Date(audit.effectiveAt),
        createdAt: new Date(audit.createdAt),
        ...(audit.reason !== undefined ? { reason: audit.reason } : {}),
        ...(audit.actorId !== undefined ? { actorId: audit.actorId } : {}),
      },
    });
    return audit;
  }

  /** Append an audit entry to an in-memory history (capped). */
  appendAudit = appendAudit;
}
