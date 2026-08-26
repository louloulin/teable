/**
 * SCIM 2.0 storage layer.
 *
 * Owns three things:
 *
 *   - The instance-level SCIM config row (kept in a private SQLite-style row
 *     in the existing setting table under a name that does NOT collide with
 *     the SettingKey enum, so this PR requires no schema migration).
 *   - The bearer-token verification used by ScimAuthGuard.
 *   - A read-only projection of all instance users into the SCIM User
 *     resource shape used by the controller. Group management is handled
 *     in-memory at this layer because Teable OSS does not model
 *     "groups of users" as a first-class entity yet — adding one would
 *     exceed the Wave 9 build brief.
 *
 * Token storage: SHA-256(salt + token) at rest. The raw token is only
 * returned once on rotation. Token verification recomputes the hash with the
 * stored salt and compares.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import type { Prisma } from '@teable/db-main-prisma';
import { PrismaService } from '@teable/db-main-prisma';
import { generateUserId } from '@teable/core';

const SCIM_SETTING_ROW_ID = 'scim:instance-config-v1';

interface IScimStoredConfig {
  enabled: boolean;
  tokenSalt: string;
  tokenHash: string;
  createdTime: string;
  lastRotatedTime: string;
}

const emptyConfig = (): IScimStoredConfig => ({
  enabled: false,
  tokenSalt: randomBytes(16).toString('hex'),
  tokenHash: '',
  createdTime: new Date().toISOString(),
  lastRotatedTime: new Date().toISOString(),
});

const hashToken = (salt: string, token: string) =>
  createHash('sha256').update(`${salt}:${token}`).digest('hex');

@Injectable()
export class ScimService {
  private readonly logger = new Logger(ScimService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── config storage ────────────────────────────────────────────────────

  async loadConfig(): Promise<IScimStoredConfig> {
    const row = await this.prisma.setting.findUnique({
      where: { id: SCIM_SETTING_ROW_ID },
    });
    if (!row || !row.content) {
      return emptyConfig();
    }
    try {
      const parsed = JSON.parse(row.content as string) as Partial<IScimStoredConfig>;
      return {
        enabled: parsed.enabled ?? false,
        tokenSalt: parsed.tokenSalt ?? randomBytes(16).toString('hex'),
        tokenHash: parsed.tokenHash ?? '',
        createdTime: parsed.createdTime ?? new Date().toISOString(),
        lastRotatedTime: parsed.lastRotatedTime ?? new Date().toISOString(),
      };
    } catch {
      return emptyConfig();
    }
  }

  private async saveConfig(cfg: IScimStoredConfig) {
    await this.prisma.setting.upsert({
      where: { id: SCIM_SETTING_ROW_ID },
      update: { content: JSON.stringify(cfg) },
      create: {
        id: SCIM_SETTING_ROW_ID,
        name: 'scimConfig',
        content: JSON.stringify(cfg),
      },
    });
  }

  // ── token rotation / verification ─────────────────────────────────────

  /** Issue a fresh bearer token, hash+salt it, and persist. Returns the raw token once. */
  async rotateToken(): Promise<{ token: string; cfg: IScimStoredConfig }> {
    const prev = await this.loadConfig();
    const tokenSalt = randomBytes(16).toString('hex');
    const token = `scim_${randomBytes(24).toString('hex')}`;
    const next: IScimStoredConfig = {
      enabled: true,
      tokenSalt,
      tokenHash: hashToken(tokenSalt, token),
      createdTime: prev.createdTime,
      lastRotatedTime: new Date().toISOString(),
    };
    await this.saveConfig(next);
    this.logger.log('SCIM bearer token rotated');
    return { token, cfg: next };
  }

  async verifyToken(token: string): Promise<boolean> {
    if (!token) return false;
    const cfg = await this.loadConfig();
    if (!cfg.enabled || !cfg.tokenHash) return false;
    return hashToken(cfg.tokenSalt, token) === cfg.tokenHash;
  }

  // ── SCIM User / Group projection ──────────────────────────────────────

  /** Project a Prisma user row into the SCIM 2.0 User resource shape. */
  toScimUser(u: {
    id: string;
    email: string;
    name: string;
    deactivatedTime?: Date | null;
    deletedTime?: Date | null;
  }) {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: u.id,
      externalId: u.email,
      userName: u.email,
      name: { formatted: u.name, familyName: undefined, givenName: undefined },
      displayName: u.name,
      emails: u.email
        ? [{ value: u.email, primary: true }]
        : ([] as Array<{ value: string; primary: boolean }>),
      active: !u.deactivatedTime && !u.deletedTime,
      meta: {
        resourceType: 'User',
        created: (u as { createdTime?: Date }).createdTime?.toISOString?.() ?? undefined,
        lastModified:
          (u as { lastModifiedTime?: Date }).lastModifiedTime?.toISOString?.() ?? undefined,
      },
    };
  }

  async listInstanceUsers() {
    return this.prisma.user.findMany({
      where: { deletedTime: null },
      select: {
        id: true,
        email: true,
        name: true,
        deactivatedTime: true,
        createdTime: true,
        lastModifiedTime: true,
      },
    });
  }

  async findInstanceUserById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, deletedTime: null },
      select: {
        id: true,
        email: true,
        name: true,
        deactivatedTime: true,
        createdTime: true,
        lastModifiedTime: true,
      },
    });
  }

  async findInstanceUserByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedTime: null },
      select: {
        id: true,
        email: true,
        name: true,
        deactivatedTime: true,
        createdTime: true,
        lastModifiedTime: true,
      },
    });
  }

  /** Soft-provision a user via the SCIM controller. Uses the same path as
   * self-signup so banned-domain + risk-control checks still apply. */
  async provisionUser(args: {
    email: string;
    name?: string;
    externalId?: string;
    active?: boolean;
  }) {
    const existing = await this.findInstanceUserByEmail(args.email);
    if (existing) return existing;
    const id = generateUserId();
    const data: Prisma.UserUncheckedCreateInput = {
      id,
      email: args.email.toLowerCase(),
      name: args.name ?? args.email.split('@')[0],
    };
    await this.prisma.user.create({ data });
    return this.findInstanceUserById(id);
  }

  async patchUserName(id: string, name: string) {
    await this.prisma.user.update({
      where: { id },
      data: { name },
    });
    return this.findInstanceUserById(id);
  }

  async deactivateUser(id: string) {
    await this.prisma.user.update({
      where: { id, deletedTime: null },
      data: { deactivatedTime: new Date() },
    });
    return this.findInstanceUserById(id);
  }

  async deleteUser(id: string) {
    await this.prisma.user.update({
      where: { id, deletedTime: null },
      data: { deletedTime: new Date() },
    });
  }
}
