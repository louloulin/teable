/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Risk policy — NestJS auth service (Stage 75).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { evaluate, validatePolicy, validateRule } from './risk-policy.service';
import type {
  IRiskDecision,
  IRiskPolicy,
  IRiskRule,
  IRiskSignal,
  RiskAction,
} from './risk-policy.types';

@Injectable()
export class RiskPolicyAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a policy. */
  validatePolicy(p: IRiskPolicy): string | null {
    return validatePolicy(p);
  }

  /** Validate a rule. */
  validateRule(r: IRiskRule): string | null {
    return validateRule(r);
  }

  /** Persist a policy. */
  async upsertPolicy(p: IRiskPolicy): Promise<IRiskPolicy> {
    const err = validatePolicy(p);
    if (err) throw new Error(`invalid policy: ${err}`);
    await this.prisma.riskPolicy.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        orgId: p.orgId,
        defaultAction: p.defaultAction,
        auditAll: p.auditAll,
        rulesJson: JSON.stringify(p.rules),
        updatedAt: new Date(p.updatedAt),
      },
      update: {
        defaultAction: p.defaultAction,
        auditAll: p.auditAll,
        rulesJson: JSON.stringify(p.rules),
        updatedAt: new Date(p.updatedAt),
      },
    });
    return p;
  }

  /** Load a policy. */
  async loadPolicy(id: string): Promise<IRiskPolicy | null> {
    const row = await this.prisma.riskPolicy.findUnique({ where: { id } });
    return row ? toPolicy(row) : null;
  }

  /** List policies for an org. */
  async listPolicies(orgId: string): Promise<IRiskPolicy[]> {
    const rows = await this.prisma.riskPolicy.findMany({ where: { orgId } });
    return rows.map(toPolicy);
  }

  /** Evaluate a policy against signals. */
  evaluate(input: {
    policy: IRiskPolicy;
    signals: IRiskSignal[];
    actorId: string;
    exempt?: boolean;
  }): IRiskDecision {
    return evaluate(input);
  }

  /** Persist a decision. */
  async persistDecision(d: IRiskDecision): Promise<IRiskDecision> {
    await this.prisma.riskDecision.upsert({
      where: { id: d.id },
      create: {
        id: d.id,
        orgId: d.orgId,
        actorId: d.actorId,
        score: d.score,
        band: d.band,
        action: d.action,
        firedRulesJson: JSON.stringify(d.firedRules),
        detail: d.detail,
        createdAt: new Date(d.createdAt),
      },
      update: {
        score: d.score,
        band: d.band,
        action: d.action,
        firedRulesJson: JSON.stringify(d.firedRules),
        detail: d.detail,
      },
    });
    return d;
  }
}

function toPolicy(row: Record<string, unknown>): IRiskPolicy {
  const json = typeof row['rulesJson'] === 'string' ? (row['rulesJson'] as string) : '[]';
  const rules = JSON.parse(json) as IRiskRule[];
  return {
    id: String(row['id']),
    orgId: String(row['orgId']),
    defaultAction: String(row['defaultAction']) as RiskAction,
    auditAll: Boolean(row['auditAll']),
    rules,
    updatedAt: new Date(String(row['updatedAt'] ?? Date.now())).toISOString(),
  };
}
