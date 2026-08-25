/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Org-level custom roles — NestJS auth service (Stage 70).
 *
 * Owns the persistence layer for custom roles + assignments, and
 * implements the decideAccess entry point. The service surfaces pure
 * helpers from org-custom-role.service for tests to cover the policy
 * boundaries; persistence methods stay thin and delegate decisions.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  canRegisterMore,
  decideAccess,
  normalizeRole,
  validateAssignment,
  validateRole,
} from './org-custom-role.service';
import type {
  BuiltInRole,
  CustomRoleCapability,
  ICustomRole,
  IOrgCustomRoleOptions,
  IRoleAssignment,
} from './org-custom-role.types';

@Injectable()
export class OrgCustomRoleAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a role — delegates to pure helper. */
  validate(role: ICustomRole, opts?: IOrgCustomRoleOptions): string | null {
    return validateRole(role, opts);
  }

  /** Normalize a role input. */
  normalize(
    input: Partial<ICustomRole> & { id: string; orgId: string; name: string }
  ): ICustomRole {
    return normalizeRole(input);
  }

  /** Whether the org can register another role. */
  canRegisterMore(currentCount: number, opts?: IOrgCustomRoleOptions): boolean {
    return canRegisterMore(currentCount, opts);
  }

  /** Persist a role (upsert). */
  async upsertRole(role: ICustomRole, opts?: IOrgCustomRoleOptions): Promise<ICustomRole> {
    const err = validateRole(role, opts);
    if (err) throw new Error(`invalid role: ${err}`);
    await this.prisma.customRole.upsert({
      where: { id: role.id },
      create: {
        id: role.id,
        orgId: role.orgId,
        name: role.name,
        description: role.description,
        capabilities: role.capabilities,
        scopes: role.scopes as unknown as object,
        enabled: role.enabled,
        createdAt: new Date(role.createdAt),
        updatedAt: new Date(role.updatedAt),
      },
      update: {
        name: role.name,
        description: role.description,
        capabilities: role.capabilities,
        scopes: role.scopes as unknown as object,
        enabled: role.enabled,
        updatedAt: new Date(role.updatedAt),
      },
    });
    return role;
  }

  /** List roles for an org. */
  async listRoles(orgId: string): Promise<ICustomRole[]> {
    const rows = await this.prisma.customRole.findMany({ where: { orgId } });
    return rows.map(toRole);
  }

  /** Load one role by id. */
  async getRole(id: string): Promise<ICustomRole | null> {
    const row = await this.prisma.customRole.findUnique({ where: { id } });
    return row ? toRole(row) : null;
  }

  /** Delete a role by id. */
  async deleteRole(id: string): Promise<void> {
    await this.prisma.customRole.delete({ where: { id } });
  }

  /** Validate an assignment — delegates to pure helper. */
  validateAssignment(a: IRoleAssignment): string | null {
    return validateAssignment(a);
  }

  /** Persist an assignment (upsert). */
  async upsertAssignment(a: IRoleAssignment): Promise<IRoleAssignment> {
    const err = validateAssignment(a);
    if (err) throw new Error(`invalid assignment: ${err}`);
    await this.prisma.roleAssignment.upsert({
      where: { id: a.id },
      create: {
        id: a.id,
        orgId: a.orgId,
        userId: a.userId,
        roleId: a.roleId,
        baseId: a.baseId,
        grantedAt: new Date(a.grantedAt),
        grantedBy: a.grantedBy,
      },
      update: {
        roleId: a.roleId,
        baseId: a.baseId,
        grantedBy: a.grantedBy,
      },
    });
    return a;
  }

  /** List assignments for a user within an org. */
  async listAssignmentsForUser(input: {
    orgId: string;
    userId: string;
  }): Promise<IRoleAssignment[]> {
    const rows = await this.prisma.roleAssignment.findMany({
      where: { orgId: input.orgId, userId: input.userId },
    });
    return rows.map(toAssignment);
  }

  /** Delete an assignment. */
  async deleteAssignment(id: string): Promise<void> {
    await this.prisma.roleAssignment.delete({ where: { id } });
  }

  /** Decide access for a user/base/capability tuple. */
  decide(input: {
    orgId: string;
    userId: string;
    baseId: string;
    capability: CustomRoleCapability;
    assignments: IRoleAssignment[];
    roles: ICustomRole[];
  }): { allow: boolean; reasons: string[] } {
    return decideAccess({
      assignments: input.assignments.filter((a) => a.orgId === input.orgId),
      roles: input.roles.filter((r) => r.orgId === input.orgId),
      userId: input.userId,
      baseId: input.baseId,
      capability: input.capability,
    });
  }

  /** Convenience: list built-in roles as a record. */
  builtIns(): Record<BuiltInRole, ReadonlyArray<CustomRoleCapability>> {
    return {
      admin: [],
      builder: [],
      editor: [],
      viewer: [],
    };
  }
}

function toRole(row: Record<string, unknown>): ICustomRole {
  const scopes = row['scopes'];
  return {
    id: String(row['id']),
    orgId: String(row['orgId']),
    name: String(row['name'] ?? ''),
    description: String(row['description'] ?? ''),
    capabilities: Array.isArray(row['capabilities'])
      ? (row['capabilities'] as CustomRoleCapability[])
      : [],
    scopes: Array.isArray(scopes) ? (scopes as ICustomRole['scopes']) : [],
    enabled: Boolean(row['enabled']),
    createdAt: new Date(String(row['createdAt'] ?? Date.now())).toISOString(),
    updatedAt: new Date(String(row['updatedAt'] ?? Date.now())).toISOString(),
  };
}

function toAssignment(row: Record<string, unknown>): IRoleAssignment {
  return {
    id: String(row['id']),
    orgId: String(row['orgId']),
    userId: String(row['userId']),
    roleId: String(row['roleId']),
    baseId: row['baseId'] === null || row['baseId'] === undefined ? null : String(row['baseId']),
    grantedAt: new Date(String(row['grantedAt'] ?? Date.now())).toISOString(),
    grantedBy: String(row['grantedBy'] ?? ''),
  };
}
