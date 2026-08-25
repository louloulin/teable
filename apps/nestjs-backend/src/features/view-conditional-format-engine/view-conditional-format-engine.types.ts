/**
 * View Conditional Format Engine — types (Stage 114).
 *
 * Applies ViewCondFormatSpec rules to cell values and produces the resulting
 * style directives (background / color / bar / icon).
 */

export interface FormatRule {
  fieldId: string;
  op: 'equals' | 'gt' | 'lt' | 'between';
  value: unknown;
  visualization: 'bar' | 'color' | 'icon';
  style?: string;
}

export interface FormatCellInput {
  fieldId: string;
  value: unknown;
}

export interface FormatStyleDirective {
  visualization: 'bar' | 'color' | 'icon';
  /** Hex color or icon name (depending on visualization). */
  style: string;
  /** Optional intensity for `bar` visualization (0..1). */
  intensity?: number;
  /** For `between` op, which bound the value crossed. */
  band?: 'min' | 'mid' | 'max';
}

export interface FormatResult {
  directives: FormatStyleDirective[];
}

export const FORMAT_COLORS = ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#5f27cd'] as const;
export const FORMAT_ICONS = ['star', 'flag', 'check', 'warning', 'info'] as const;