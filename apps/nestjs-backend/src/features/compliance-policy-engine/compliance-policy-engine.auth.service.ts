/**
 * Compliance Policy Engine — NestJS auth service (Stage 126).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  BUILTIN_POLICIES,
  actionsForViolation,
  buildBundle,
  buildRuleId,
  bundleHash,
  evaluateBundle,
  evaluateRule,
  filterBySeverity,
  filterViolations,
  findRule,
  isRuleIdValid,
  isRuleValid,
  maxSeverity,
  shouldBlock,
} from './compliance-policy-engine.service';
import {
  PolicyBundle,
  PolicyContext,
  PolicyEvalResult,
  PolicyRule,
  PolicySeverity,
  PolicyViolation,
} from './compliance-policy-engine.types';

@Injectable()
export class CompliancePolicyEngineAuthService {
  constructor(private readonly prisma: PrismaService) {}

  builtin(): readonly PolicyRule[] { return BUILTIN_POLICIES; }
  buildId(title: string): string { return buildRuleId(title); }
  validId(id: string): boolean { return isRuleIdValid(id); }
  validRule(rule: PolicyRule): boolean { return isRuleValid(rule); }
  bundle(rules: readonly PolicyRule[], version?: string): PolicyBundle { return buildBundle(rules, version); }
  find(b: PolicyBundle, id: string): PolicyRule | undefined { return findRule(b, id); }
  bySeverity(b: PolicyBundle, s: PolicySeverity): PolicyRule[] { return filterBySeverity(b, s); }
  evaluate(b: PolicyBundle, ctx: PolicyContext, now?: string): PolicyEvalResult { return evaluateBundle(b, ctx, now); }
  evalRule(r: PolicyRule, ctx: PolicyContext, now?: string): PolicyViolation | undefined { return evaluateRule(r, ctx, now); }
  block(r: PolicyEvalResult): boolean { return shouldBlock(r); }
  filterViolations(r: PolicyEvalResult, s: PolicySeverity): PolicyViolation[] { return filterViolations(r, s); }
  worst(violations: readonly PolicyViolation[]): PolicySeverity | undefined { return maxSeverity(violations); }
  actionsFor(result: PolicyEvalResult, ruleId: string, b: PolicyBundle) { return actionsForViolation(result, ruleId, b); }
  hash(b: PolicyBundle): string { return bundleHash(b); }

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}