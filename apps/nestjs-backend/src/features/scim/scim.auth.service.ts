import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  generateScimToken,
  groupToScim,
  hashScimToken,
  matchesFilter,
  parseBearerHeader,
  scimToUserPatch,
  toListResponse,
  userToScim,
} from './scim.service';
import type { IScimAuthContext, IScimGroup, IScimUser } from './scim.types';

/**
 * SCIM 2.0 orchestrator — Stage 23.
 *
 * Provides the /Users, /Groups, /ServiceProviderConfig endpoints an
 * enterprise IdP (Okta, Azure AD, Google Workspace) needs to push
 * directory changes into Teable. Tokens are issued by the admin UI
 * and presented as `Authorization: Bearer <token>`; we hash the
 * token and look it up.
 */
@Injectable()
export class ScimAuthService {
  /** Default page size for /Users and /Groups list endpoints. */
  static readonly DEFAULT_PAGE_SIZE = 50;
  /** Max page size to keep list responses bounded. */
  static readonly MAX_PAGE_SIZE = 200;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issue a fresh SCIM bearer token. Returns the plaintext ONCE;
   * only the hash is persisted.
   */
  async createToken(input: {
    organizationId: string;
    label: string;
    createdBy: string;
    expiresAt?: Date;
  }): Promise<{ id: string; plaintext: string; prefix: string }> {
    const { plaintext, hash, prefix } = generateScimToken();
    const id = `scimt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    await this.prisma.scimToken.create({
      data: {
        id,
        organizationId: input.organizationId,
        label: input.label,
        tokenHash: hash,
        tokenPrefix: prefix,
        enabled: true,
        expiresAt: input.expiresAt ?? null,
        createdBy: input.createdBy,
      },
    });
    return { id, plaintext, prefix };
  }

  /** Verify the bearer token and return the SCIM auth context (or 401). */
  async verifyBearer(authHeader: string | null | undefined): Promise<IScimAuthContext> {
    const plaintext = parseBearerHeader(authHeader);
    if (!plaintext) throw new UnauthorizedException('missing bearer token');
    const tokenHash = hashScimToken(plaintext);
    const row = await this.prisma.scimToken.findUnique({ where: { tokenHash } });
    if (!row || !row.enabled) {
      throw new UnauthorizedException('invalid token');
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('token expired');
    }
    // Best-effort lastUsedAt update; failure is non-fatal.
    this.prisma.scimToken
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return { tokenId: row.id, organizationId: row.organizationId };
  }

  /** Revoke a token (used when an IdP integration is decommissioned). */
  async revokeToken(input: { tokenId: string; organizationId: string }): Promise<void> {
    await this.prisma.scimToken.updateMany({
      where: { id: input.tokenId, organizationId: input.organizationId },
      data: { enabled: false },
    });
  }

  /** GET /scim/v2/Users?filter=...&startIndex=1&count=50 */
  async listUsers(input: {
    auth: IScimAuthContext;
    filter?: string;
    startIndex?: number;
    count?: number;
  }): Promise<{
    totalResults: number;
    itemsPerPage: number;
    startIndex: number;
    Resources: IScimUser[];
  }> {
    const startIndex = Math.max(1, input.startIndex ?? 1);
    const count = Math.min(
      ScimAuthService.MAX_PAGE_SIZE,
      Math.max(1, input.count ?? ScimAuthService.DEFAULT_PAGE_SIZE)
    );
    const where = { organizationId: input.auth.organizationId };
    const all = await this.prisma.user.findMany({ where });
    const mapped = all
      .map((u) => ({
        id: u.id,
        externalId: (u as unknown as { externalId?: string | null }).externalId ?? null,
        email: u.email,
        name: u.name,
        active: !u.deactivatedTime,
        role: ((u as unknown as { role?: string }).role ?? 'member') as string,
      }))
      .map(userToScim);
    const filtered = mapped.filter((u) =>
      matchesFilter(input.filter, u as unknown as Record<string, unknown>)
    );
    const page = filtered.slice(startIndex - 1, startIndex - 1 + count);
    return {
      ...toListResponse({
        resources: page,
        startIndex,
        itemsPerPage: count,
        totalResults: filtered.length,
      }),
    };
  }

  /** GET /scim/v2/Users/{id} */
  async getUser(input: { auth: IScimAuthContext; id: string }): Promise<IScimUser | null> {
    const u = await this.prisma.user.findFirst({
      where: { id: input.id, organizationId: input.auth.organizationId },
    });
    if (!u) return null;
    return userToScim({
      id: u.id,
      externalId: (u as unknown as { externalId?: string | null }).externalId ?? null,
      email: u.email,
      name: u.name,
      active: !u.deactivatedTime,
      role: ((u as unknown as { role?: string }).role ?? 'member') as string,
    });
  }

  /** POST /scim/v2/Users — provision a new user from the IdP. */
  async createUser(input: {
    auth: IScimAuthContext;
    body: IScimUser;
    tokenId: string;
  }): Promise<IScimUser> {
    const patch = scimToUserPatch(input.body);
    const id =
      input.body.id ?? `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const created = await this.prisma.user.create({
      data: {
        id,
        email: patch.email,
        name: patch.name,
        organizationId: input.auth.organizationId,
        ...(patch.active ? {} : { deactivatedTime: new Date() }),
      },
    });
    await this.writeEvent({
      organizationId: input.auth.organizationId,
      tokenId: input.tokenId,
      action: 'create_user',
      externalId: patch.externalId,
      targetId: created.id,
      body: input.body,
      statusCode: 201,
    });
    return userToScim({
      id: created.id,
      externalId: patch.externalId,
      email: patch.email,
      name: patch.name,
      active: patch.active,
      role: patch.role,
    });
  }

  /** PUT /scim/v2/Users/{id} — overwrite attributes from the IdP. */
  async replaceUser(input: {
    auth: IScimAuthContext;
    id: string;
    body: IScimUser;
    tokenId: string;
  }): Promise<IScimUser | null> {
    const existing = await this.prisma.user.findFirst({
      where: { id: input.id, organizationId: input.auth.organizationId },
    });
    if (!existing) return null;
    const patch = scimToUserPatch(input.body);
    const updated = await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        email: patch.email,
        name: patch.name,
        ...(patch.active
          ? { deactivatedTime: null }
          : existing.deactivatedTime
            ? {}
            : { deactivatedTime: new Date() }),
      },
    });
    await this.writeEvent({
      organizationId: input.auth.organizationId,
      tokenId: input.tokenId,
      action: 'update_user',
      externalId: patch.externalId,
      targetId: updated.id,
      body: input.body,
      statusCode: 200,
    });
    return userToScim({
      id: updated.id,
      externalId: patch.externalId,
      email: updated.email,
      name: updated.name,
      active: !updated.deactivatedTime,
      role: patch.role,
    });
  }

  /** DELETE /scim/v2/Users/{id} — deactivate the user (soft delete). */
  async deleteUser(input: {
    auth: IScimAuthContext;
    id: string;
    tokenId: string;
  }): Promise<boolean> {
    const existing = await this.prisma.user.findFirst({
      where: { id: input.id, organizationId: input.auth.organizationId },
    });
    if (!existing) return false;
    await this.prisma.user.update({
      where: { id: existing.id },
      data: { deactivatedTime: existing.deactivatedTime ?? new Date() },
    });
    await this.writeEvent({
      organizationId: input.auth.organizationId,
      tokenId: input.tokenId,
      action: 'delete_user',
      externalId: null,
      targetId: existing.id,
      body: { id: existing.id },
      statusCode: 204,
    });
    return true;
  }

  /** GET /scim/v2/Groups — list groups with member expansion. */
  async listGroups(input: {
    auth: IScimAuthContext;
    filter?: string;
  }): Promise<{ Resources: IScimGroup[] }> {
    // We don't have a dedicated Group table yet — fall back to a flat
    // membership table surfaced through the existing PermissionRole.
    const roles = await this.prisma.permissionRole.findMany({
      where: { organizationId: input.auth.organizationId },
      include: { members: true },
    });
    const groups = roles.map((r) =>
      groupToScim({
        id: r.id,
        externalId: null,
        displayName: r.name,
        memberIds: r.members.map((m) => m.userId),
      })
    );
    const filtered = groups.filter((g) =>
      matchesFilter(input.filter, { displayName: g.displayName } as unknown as Record<
        string,
        unknown
      >)
    );
    return { Resources: filtered };
  }

  // --- internals ---

  private async writeEvent(input: {
    organizationId: string;
    tokenId: string;
    action: string;
    externalId: string | null;
    targetId: string | null;
    body: unknown;
    statusCode: number;
  }): Promise<void> {
    try {
      await this.prisma.scimEvent.create({
        data: {
          id: `scimev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
          organizationId: input.organizationId,
          tokenId: input.tokenId,
          action: input.action,
          externalId: input.externalId,
          targetId: input.targetId,
          requestJson: input.body as object,
          statusCode: input.statusCode,
        },
      });
    } catch {
      // Audit failures must never break the SCIM request itself.
    }
  }
}
