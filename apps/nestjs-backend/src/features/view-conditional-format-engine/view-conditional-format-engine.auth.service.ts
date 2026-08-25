/**
 * View Conditional Format Engine — NestJS auth service (Stage 114).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  applyRules,
  countMatches,
  evaluateRule,
  filterValid,
  firstMatch,
  isRuleValid,
} from './view-conditional-format-engine.service';
import {
  FormatCellInput,
  FormatResult,
  FormatRule,
  FormatStyleDirective,
} from './view-conditional-format-engine.types';

@Injectable()
export class ViewConditionalFormatEngineAuthService {
  constructor(private readonly prisma: PrismaService) {}

  evaluate(rule: FormatRule, cell: FormatCellInput): FormatStyleDirective | null {
    return evaluateRule(rule, cell);
  }

  apply(rules: readonly FormatRule[], cell: FormatCellInput): FormatResult {
    return applyRules(rules, cell);
  }

  firstMatch(rules: readonly FormatRule[], cell: FormatCellInput): FormatRule | null {
    return firstMatch(rules, cell);
  }

  count(rules: readonly FormatRule[], cells: readonly FormatCellInput[]): number {
    return countMatches(rules, cells);
  }

  isValid(rule: FormatRule): boolean {
    return isRuleValid(rule);
  }

  filter(rules: readonly FormatRule[]): FormatRule[] {
    return filterValid(rules);
  }

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}