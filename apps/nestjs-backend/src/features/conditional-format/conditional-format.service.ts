import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  CF_OPERATORS,
  CfOperator,
  ICfEvaluationResult,
  ICfRuleInput,
  ICfRuleRow,
  ICfStyle,
} from './conditional-format.types';

interface IConditionalFormatRuleDelegate {
  findMany(args: { where: { viewId: string } }): Promise<ICfRuleRow[]>;
  upsert(args: {
    where: { id: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<ICfRuleRow>;
  delete(args: { where: { id: string } }): Promise<unknown>;
}

const isEmpty = (v: unknown): boolean =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' && v === '') ||
  (Array.isArray(v) && v.length === 0);

const coerceNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
};

const compare = (left: unknown, op: CfOperator, right: unknown): boolean => {
  switch (op) {
    case 'eq':
      return left === right;
    case 'neq':
      // neq is intentionally not fired for null/undefined left — that
      // would match every non-null value, which is rarely what users
      // expect when they say "highlight non-X".
      if (left === null || left === undefined) return false;
      return left !== right;
    case 'gt': {
      const a = coerceNumber(left);
      const b = coerceNumber(right);
      return a !== null && b !== null && a > b;
    }
    case 'lt': {
      const a = coerceNumber(left);
      const b = coerceNumber(right);
      return a !== null && b !== null && a < b;
    }
    case 'contains': {
      if (typeof left !== 'string' || typeof right !== 'string') return false;
      return left.toLowerCase().includes(right.toLowerCase());
    }
    case 'empty':
      return isEmpty(left);
    case 'not_empty':
      return !isEmpty(left);
    case 'in':
      return Array.isArray(right) && (right as unknown[]).includes(left);
    default:
      return false;
  }
};

const mergeStyle = (base: ICfStyle | null, override: ICfStyle): ICfStyle => ({
  ...(base ?? {}),
  ...override,
});

/**
 * Conditional formatting service.
 *
 * Two layers:
 *   1. CRUD on the rule rows (listByView / upsert / delete).
 *   2. Pure evaluate() that takes a record and returns the merged
 *      style map — callers feed this to the grid renderer.
 *
 * Rules apply in priority ASC order: lower priority (more important)
 * is the first writer, later rules override earlier ones. We chose
 * ASC so that re-ordering via `priority: number` changes is the
 * common case (just lower a number to bring a rule forward).
 */
@Injectable()
export class ConditionalFormatService {
  constructor(private readonly prisma: PrismaService) {}

  private get delegate(): IConditionalFormatRuleDelegate {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as unknown as { conditionalFormatRule: IConditionalFormatRuleDelegate })
      .conditionalFormatRule;
  }

  async listByView(viewId: string): Promise<ICfRuleRow[]> {
    const rows = await this.delegate.findMany({ where: { viewId } });
    // Apply ASC by priority at read time so we don't rely on DB-side ordering.
    return [...rows].sort((a, b) => a.priority - b.priority);
  }

  async upsert(viewId: string, id: string | null, input: ICfRuleInput): Promise<ICfRuleRow> {
    if (!(CF_OPERATORS as readonly string[]).includes(input.operator)) {
      throw new BadRequestException(`invalid operator: ${input.operator}`);
    }
    const ruleId = id ?? `cf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    return this.delegate.upsert({
      where: { id: ruleId },
      create: {
        id: ruleId,
        viewId,
        name: input.name,
        fieldId: input.fieldId,
        operator: input.operator,
        value: input.value as Record<string, unknown>,
        style: input.style as Record<string, unknown>,
        priority: input.priority ?? 100,
        enabled: input.enabled ?? true,
        createdTime: new Date(),
        lastModifiedTime: new Date(),
      },
      update: {
        name: input.name,
        fieldId: input.fieldId,
        operator: input.operator,
        value: input.value as Record<string, unknown>,
        style: input.style as Record<string, unknown>,
        priority: input.priority ?? 100,
        enabled: input.enabled ?? true,
        lastModifiedTime: new Date(),
      },
    });
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.delegate.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pure: given a record and a list of rules, compute the merged
   * style. Used both online (single row preview) and offline (bulk
   * re-render). Does not touch the DB.
   */
  evaluate(rules: ICfRuleRow[], record: Record<string, unknown>): ICfEvaluationResult {
    const sorted = [...rules]
      .filter((r) => r.enabled)
      // Sort DESC so the highest priority (most important) is applied
      // last and therefore overrides earlier rules. Lower-number
      // priority values are conventionally "more important" — this is
      // intentionally inverted relative to the storage default so
      // users can lower a number to bump a rule forward.
      .sort((a, b) => b.priority - a.priority);
    let rowStyle: ICfStyle | null = null;
    const fieldStyles: Record<string, ICfStyle> = {};
    for (const rule of sorted) {
      const matches = this.ruleMatches(rule, record);
      if (!matches) continue;
      if (rule.fieldId === null || rule.fieldId === undefined) {
        rowStyle = mergeStyle(rowStyle, rule.style);
      } else {
        fieldStyles[rule.fieldId] = mergeStyle(fieldStyles[rule.fieldId] ?? null, rule.style);
      }
    }
    return { rowStyle, fieldStyles };
  }

  private ruleMatches(rule: ICfRuleRow, record: Record<string, unknown>): boolean {
    if (rule.fieldId === null || rule.fieldId === undefined) {
      // Row-level rules: only meaningful with empty/not_empty; for any
      // other operator the row has no single value to compare against.
      const empty = this.recordIsEmpty(record);
      if (rule.operator === 'empty') return empty;
      if (rule.operator === 'not_empty') return !empty;
      return false;
    }
    const left = record[rule.fieldId];
    return compare(left, rule.operator, rule.value);
  }

  private recordIsEmpty(record: Record<string, unknown>): boolean {
    for (const v of Object.values(record)) {
      if (!isEmpty(v)) return false;
    }
    return true;
  }
}
