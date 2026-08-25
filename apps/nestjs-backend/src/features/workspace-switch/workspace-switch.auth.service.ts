import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildSessionRow,
  computeEffectiveRole,
  evaluateConsumption,
  generateSwitchToken,
  hashSwitchToken,
  isGrantActive,
  resolveGrantExpiresAt,
  verifyToken,
} from './workspace-switch.service';
import type {
  CrossOrgRole,
  IConsumeResult,
  ICreateSwitchInput,
  IEffectiveRoleResult,
  IGrantInput,
  IWorkspaceSwitchSession,
} from './workspace-switch.types';

/**
 * Workspace switcher + cross-org admin grant — Stage 27.
 *
 * Issues short-lived single-use switch tokens, consumes them, and
 * grants/revokes cross-org admin overrides. The native ACL still
 * runs; this layer only widens access — never narrows it.
 */
@Injectable()
export class WorkspaceSwitchAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Mint a switch token and persist its hash. Returns the raw token. */
  async createSwitch(input: ICreateSwitchInput): Promise<{
    token: string;
    session: IWorkspaceSwitchSession;
  }> {
    if (!input.userId || !input.toSpaceId) {
      throw new BadRequestException('userId and toSpaceId are required');
    }
    if (input.fromSpaceId === input.toSpaceId) {
      throw new BadRequestException('fromSpaceId and toSpaceId must differ');
    }
    const token = generateSwitchToken();
    const id = `wss_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const partial = buildSessionRow({ ...input, id, token });
    const created = await this.prisma.workspaceSwitchSession.create({
      data: {
        id: partial.id,
        userId: partial.userId,
        fromSpaceId: partial.fromSpaceId,
        toSpaceId: partial.toSpaceId,
        token: partial.token,
        expiresAt: partial.expiresAt,
      },
    });
    return { token, session: toRow(created) };
  }

  /** Verify + consume a switch token. Single-use. */
  async consumeSwitch(input: { userId: string; presentedToken: string }): Promise<IConsumeResult> {
    const stored = await this.prisma.workspaceSwitchSession.findFirst({
      where: { userId: input.userId },
    });
    if (!stored) return { ok: false, toSpaceId: null, reason: 'unknown' };
    if (!verifyToken(input.presentedToken, stored.token)) {
      return { ok: false, toSpaceId: null, reason: 'unknown' };
    }
    const session = toRow(stored);
    const evalResult = evaluateConsumption({ session });
    if (evalResult.ok) {
      await this.prisma.workspaceSwitchSession.update({
        where: { id: stored.id },
        data: { consumedAt: new Date() },
      });
    }
    return evalResult;
  }

  /** Revoke all unconsumed sessions for a user. */
  async revokeAllForUser(userId: string): Promise<number> {
    const r = await this.prisma.workspaceSwitchSession.deleteMany({
      where: { userId, consumedAt: null },
    });
    return r.count;
  }

  /** Grant a cross-org admin override. */
  async grantCrossOrg(input: IGrantInput): Promise<{
    id: string;
    expiresAt: Date | null;
  }> {
    if (!input.userId || !input.spaceId || !input.grantedBy) {
      throw new BadRequestException('userId, spaceId and grantedBy are required');
    }
    const id = `coag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const expiresAt = resolveGrantExpiresAt({ ttlSeconds: input.ttlSeconds });
    await this.prisma.crossOrgAdminGrant.create({
      data: {
        id,
        userId: input.userId,
        spaceId: input.spaceId,
        grantedBy: input.grantedBy,
        role: input.role,
        reason: input.reason ?? null,
        expiresAt,
      },
    });
    return { id, expiresAt };
  }

  /** Revoke (soft) a cross-org grant. */
  async revokeCrossOrg(id: string): Promise<boolean> {
    const existing = await this.prisma.crossOrgAdminGrant.findUnique({ where: { id } });
    if (!existing || existing.revokedAt) return false;
    await this.prisma.crossOrgAdminGrant.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return true;
  }

  /**
   * Look up the effective role for a user in a space: native role
   * widened by the active cross-org grant, if any.
   */
  async effectiveRole(input: {
    userId: string;
    spaceId: string;
    baseRole: CrossOrgRole | null;
  }): Promise<IEffectiveRoleResult> {
    const grant = await this.prisma.crossOrgAdminGrant.findFirst({
      where: {
        userId: input.userId,
        spaceId: input.spaceId,
      },
    });
    const crossOrgRole = grant && isGrantActive({ grant }) ? (grant.role as CrossOrgRole) : null;
    return computeEffectiveRole({ baseRole: input.baseRole, crossOrgRole });
  }
}

function toRow(r: {
  id: string;
  userId: string;
  fromSpaceId: string | null;
  toSpaceId: string;
  token: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdTime: Date;
}): IWorkspaceSwitchSession {
  return {
    id: r.id,
    userId: r.userId,
    fromSpaceId: r.fromSpaceId,
    toSpaceId: r.toSpaceId,
    token: r.token,
    expiresAt: r.expiresAt,
    consumedAt: r.consumedAt,
    createdTime: r.createdTime,
  };
}

// Re-export the helpers for callers that need them directly.
export {
  buildSessionRow,
  computeEffectiveRole,
  evaluateConsumption,
  generateSwitchToken,
  hashSwitchToken,
  isGrantActive,
  resolveGrantExpiresAt,
  verifyToken,
};
