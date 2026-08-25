import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  applyPolicy,
  applyPolicies,
  isValidRole,
  isValidScope,
  isValidStrategy,
  validateCreateInput,
  viewerMaySee,
} from './data-masking.service';
import type {
  ICreatePolicyInput,
  IMaskingPolicy,
  MaskingRole,
  MaskingScope,
  MaskingStrategy,
} from './data-masking.types';

@Injectable()
export class DataMaskingAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async createPolicy(input: ICreatePolicyInput): Promise<IMaskingPolicy> {
    validateCreateInput(input);
    const id = `mp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.maskingPolicy.create({
      data: {
        id,
        baseId: input.baseId,
        tableId: input.tableId,
        fieldId: input.fieldId,
        strategy: input.strategy,
        scope: input.scope,
        allowedRolesJson: JSON.stringify(input.allowedRoles ?? []),
        partialJson: input.partial ? JSON.stringify(input.partial) : null,
        regexRulesJson: input.regexRules ? JSON.stringify(input.regexRules) : null,
        label: input.label ?? null,
      },
    });
    return toPolicy(row);
  }

  async listPolicies(baseId: string, tableId?: string): Promise<IMaskingPolicy[]> {
    const where: Record<string, unknown> = { baseId };
    if (tableId) where['tableId'] = tableId;
    const rows = await this.prisma.maskingPolicy.findMany({ where });
    return rows.map(toPolicy);
  }

  async getPolicy(id: string): Promise<IMaskingPolicy> {
    const row = await this.prisma.maskingPolicy.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`policy not found: ${id}`);
    return toPolicy(row);
  }

  async updatePolicy(
    id: string,
    patch: Partial<
      Pick<ICreatePolicyInput, 'scope' | 'allowedRoles' | 'partial' | 'regexRules' | 'label'>
    >
  ): Promise<IMaskingPolicy> {
    const existing = await this.prisma.maskingPolicy.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`policy not found: ${id}`);
    if (patch.scope && !isValidScope(patch.scope)) {
      throw new BadRequestException(`invalid scope: ${patch.scope}`);
    }
    if (patch.allowedRoles) {
      for (const r of patch.allowedRoles) {
        if (!isValidRole(r)) throw new BadRequestException(`invalid role: ${r}`);
      }
    }
    const updated = await this.prisma.maskingPolicy.update({
      where: { id },
      data: {
        scope: patch.scope ?? undefined,
        allowedRolesJson: patch.allowedRoles ? JSON.stringify(patch.allowedRoles) : undefined,
        partialJson: patch.partial !== undefined ? JSON.stringify(patch.partial) : undefined,
        regexRulesJson:
          patch.regexRules !== undefined ? JSON.stringify(patch.regexRules) : undefined,
        label: patch.label ?? undefined,
      },
    });
    return toPolicy(updated);
  }

  async deletePolicy(id: string): Promise<void> {
    const existing = await this.prisma.maskingPolicy.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`policy not found: ${id}`);
    await this.prisma.maskingPolicy.delete({ where: { id } });
  }

  async recordMasking(input: {
    baseId: string;
    tableId: string;
    recordId: string;
    fieldId: string;
    policyId: string;
    viewerUserId: string;
  }): Promise<void> {
    const id = `mf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    await this.prisma.maskedFieldRow.create({
      data: {
        id,
        baseId: input.baseId,
        tableId: input.tableId,
        recordId: input.recordId,
        fieldId: input.fieldId,
        policyId: input.policyId,
        viewerUserId: input.viewerUserId,
      },
    });
  }

  async listMaskingHistory(input: { baseId: string; recordId?: string; limit?: number }) {
    const limit = input.limit ?? 100;
    const where: Record<string, unknown> = { baseId: input.baseId };
    if (input.recordId) where['recordId'] = input.recordId;
    return await this.prisma.maskedFieldRow.findMany({
      where,
      orderBy: { createdTime: 'desc' },
      take: limit,
    });
  }

  maskValueForViewer(
    policy: IMaskingPolicy,
    value: unknown,
    viewerRole: MaskingRole
  ): { masked: boolean; value: unknown } {
    return applyPolicy(policy, value, viewerRole);
  }

  maskRecordForViewer(
    policies: ReadonlyArray<IMaskingPolicy>,
    values: Record<string, unknown>,
    viewerRole: MaskingRole
  ): Record<string, unknown> {
    return applyPolicies(policies, values, viewerRole);
  }

  isValidStrategy = isValidStrategy;
  isValidRole = isValidRole;
  viewerMaySee = viewerMaySee;
}

function toPolicy(r: {
  id: string;
  baseId: string;
  tableId: string;
  fieldId: string;
  strategy: string;
  scope: string;
  allowedRolesJson: string;
  partialJson: string | null;
  regexRulesJson: string | null;
  label: string | null;
  createdTime: Date;
  updatedTime: Date;
}): IMaskingPolicy {
  return {
    id: r.id,
    baseId: r.baseId,
    tableId: r.tableId,
    fieldId: r.fieldId,
    strategy: r.strategy as MaskingStrategy,
    scope: r.scope as MaskingScope,
    allowedRoles: JSON.parse(r.allowedRolesJson) as MaskingRole[],
    partial: r.partialJson ? (JSON.parse(r.partialJson) as IMaskingPolicy['partial']) : undefined,
    regexRules: r.regexRulesJson
      ? (JSON.parse(r.regexRulesJson) as IMaskingPolicy['regexRules'])
      : undefined,
    label: r.label ?? undefined,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}
