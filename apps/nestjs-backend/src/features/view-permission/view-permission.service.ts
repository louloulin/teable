import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  IResolveArgs,
  IViewPermissionInput,
  IViewPermissionRow,
  VIEW_PERMISSIONS,
  ViewPermissionLevel,
  ViewSubjectKind,
} from './view-permission.types';

const RANK: Record<ViewPermissionLevel, number> = {
  denied: -1,
  read: 1,
  write: 2,
  owner: 3,
};

interface IViewPermissionDelegate {
  findMany(args: { where: { viewId: string } }): Promise<IViewPermissionRow[]>;
  upsert(args: {
    where: {
      viewId_subjectKind_subjectId: {
        viewId: string;
        subjectKind: ViewSubjectKind;
        subjectId: string;
      };
    };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<IViewPermissionRow>;
  delete(args: {
    where: {
      viewId_subjectKind_subjectId: {
        viewId: string;
        subjectKind: ViewSubjectKind;
        subjectId: string;
      };
    };
  }): Promise<unknown>;
}

/**
 * View-level permission service.
 *
 * Pure model layer: the controller is responsible for resolving the
 * caller's identity + role set. The service only handles ACL row CRUD
 * and the (deterministic) resolve() decision function.
 *
 * Resolved permission semantics:
 *   - viewCreatorId always resolves to 'owner' (table-level owner)
 *   - an explicit 'denied' for the user wins over any grant
 *   - otherwise the highest-rank permission among user-grants and
 *     role-grants is returned
 *   - no rule matches → 'denied' (no implicit read)
 */
@Injectable()
export class ViewPermissionService {
  constructor(private readonly prisma: PrismaService) {}

  private get delegate(): IViewPermissionDelegate {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as unknown as { viewPermission: IViewPermissionDelegate }).viewPermission;
  }

  async list(viewId: string): Promise<IViewPermissionRow[]> {
    return this.delegate.findMany({ where: { viewId } });
  }

  async grant(viewId: string, input: IViewPermissionInput): Promise<IViewPermissionRow> {
    if (!(VIEW_PERMISSIONS as readonly string[]).includes(input.permission)) {
      throw new BadRequestException(`invalid permission: ${input.permission}`);
    }
    if (input.subjectKind !== 'user' && input.subjectKind !== 'role') {
      throw new BadRequestException(`invalid subject_kind: ${input.subjectKind}`);
    }
    const id = `vp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return this.delegate.upsert({
      where: {
        viewId_subjectKind_subjectId: {
          viewId,
          subjectKind: input.subjectKind,
          subjectId: input.subjectId,
        },
      },
      create: {
        id,
        viewId,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        permission: input.permission,
        createdTime: new Date(),
        lastModifiedTime: new Date(),
      },
      update: {
        permission: input.permission,
        lastModifiedTime: new Date(),
      },
    });
  }

  async revoke(viewId: string, subjectKind: ViewSubjectKind, subjectId: string): Promise<boolean> {
    try {
      await this.delegate.delete({
        where: {
          viewId_subjectKind_subjectId: { viewId, subjectKind, subjectId },
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Compute the effective permission for a user on a view. Pure logic
   * so it's cheap to call from request guards. The caller passes the
   * already-resolved role set; we don't fetch anything else from DB.
   */
  async resolve(args: IResolveArgs): Promise<ViewPermissionLevel> {
    if (args.userId === args.viewCreatorId) return 'owner';
    const rows = await this.delegate.findMany({ where: { viewId: args.viewId } });
    // User rules first: explicit 'denied' for the user always wins.
    const userRules = rows.filter((r) => r.subjectKind === 'user' && r.subjectId === args.userId);
    if (userRules.some((r) => r.permission === 'denied')) return 'denied';
    const roleSet = new Set(args.roleIds);
    const roleRules = rows.filter((r) => r.subjectKind === 'role' && roleSet.has(r.subjectId));
    const combined = [...userRules, ...roleRules];
    if (combined.length === 0) return 'denied';
    let best: ViewPermissionLevel = 'read';
    for (const r of combined) {
      if (RANK[r.permission] > RANK[best]) best = r.permission;
    }
    // Any positive grant from the user always beats 'denied' from a role.
    const userBest = userRules.find((r) => r.permission !== 'denied');
    if (userBest && userBest.permission === 'owner') return 'owner';
    return best;
  }

  /**
   * Convenience predicate for guards: throws 403 if the resolved
   * permission is below `required`.
   */
  async assertAtLeast(args: IResolveArgs, required: ViewPermissionLevel): Promise<void> {
    const resolved = await this.resolve(args);
    if (resolved === 'denied' || RANK[resolved] < RANK[required]) {
      throw new BadRequestException(`view permission denied (have=${resolved}, need=${required})`);
    }
  }
}
