/**
 * Conditional formatting (Stage 18) — types.
 *
 * Operators map 1:1 to the SQL CHECK constraint in the migration.
 * The `in` operator takes a JSON array as `value`. Other operators
 * take a JSON-scalar (string/number/boolean).
 */

export const CF_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'lt',
  'contains',
  'empty',
  'not_empty',
  'in',
] as const;
export type CfOperator = (typeof CF_OPERATORS)[number];

export interface ICfStyle {
  bgColor?: string;
  fgColor?: string;
  bold?: boolean;
  italic?: boolean;
  icon?: string;
}

export interface ICfRuleRow {
  id: string;
  viewId: string;
  name: string;
  fieldId: string | null;
  operator: CfOperator;
  value: unknown;
  style: ICfStyle;
  priority: number;
  enabled: boolean;
  createdTime: Date;
}

export interface ICfRuleInput {
  name: string;
  fieldId: string | null;
  operator: CfOperator;
  value: unknown;
  style: ICfStyle;
  priority?: number;
  enabled?: boolean;
}

/**
 * Result of evaluating all enabled rules for a view against a single
 * row. `rowStyle` applies to the whole row; `fieldStyles` is keyed by
 * field_id and is what the grid renderer uses to color cells.
 */
export interface ICfEvaluationResult {
  rowStyle: ICfStyle | null;
  fieldStyles: Record<string, ICfStyle>;
}
