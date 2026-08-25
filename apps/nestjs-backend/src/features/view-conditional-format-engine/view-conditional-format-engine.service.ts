/**
 * View Conditional Format Engine — pure helpers (Stage 114).
 */

import {
  FORMAT_COLORS,
  FORMAT_ICONS,
  FormatCellInput,
  FormatResult,
  FormatRule,
  FormatStyleDirective,
} from './view-conditional-format-engine.types';

/** Apply a single rule to a single cell. */
export function evaluateRule(rule: FormatRule, cell: FormatCellInput): FormatStyleDirective | null {
  if (rule.fieldId !== cell.fieldId) return null;
  if (rule.op === 'equals') {
    if (cell.value === rule.value) {
      return directive(rule);
    }
    return null;
  }
  if (rule.op === 'gt') {
    if (typeof cell.value === 'number' && typeof rule.value === 'number' && cell.value > rule.value) {
      const d = directive(rule);
      if (rule.visualization === 'bar' && typeof cell.value === 'number') {
        d.intensity = clamp01((cell.value - rule.value) / Math.max(1, cell.value));
      }
      return d;
    }
    return null;
  }
  if (rule.op === 'lt') {
    if (typeof cell.value === 'number' && typeof rule.value === 'number' && cell.value < rule.value) {
      return directive(rule);
    }
    return null;
  }
  if (rule.op === 'between') {
    const [min, max] = Array.isArray(rule.value) ? (rule.value as [number, number]) : [null, null];
    if (typeof cell.value !== 'number' || min === null || max === null) return null;
    if (cell.value >= min && cell.value <= max) {
      const d = directive(rule);
      const span = Math.max(1, max - min);
      d.intensity = clamp01((cell.value - min) / span);
      d.band = cell.value < (min + max) / 2 ? 'min' : cell.value > (min + max) / 2 ? 'max' : 'mid';
      return d;
    }
    return null;
  }
  return null;
}

function directive(rule: FormatRule): FormatStyleDirective {
  let style = rule.style;
  if (!style) {
    if (rule.visualization === 'icon') style = FORMAT_ICONS[Math.abs(hashStr(rule.fieldId)) % FORMAT_ICONS.length];
    else style = FORMAT_COLORS[Math.abs(hashStr(rule.fieldId)) % FORMAT_COLORS.length];
  }
  return { visualization: rule.visualization, style };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Apply all rules to a cell. The first match wins for each visualization. */
export function applyRules(rules: readonly FormatRule[], cell: FormatCellInput): FormatResult {
  const seen = new Set<string>();
  const directives: FormatStyleDirective[] = [];
  for (const r of rules) {
    const d = evaluateRule(r, cell);
    if (!d) continue;
    if (seen.has(d.visualization)) continue;
    seen.add(d.visualization);
    directives.push(d);
  }
  return { directives };
}

/** Find the first matching rule. */
export function firstMatch(rules: readonly FormatRule[], cell: FormatCellInput): FormatRule | null {
  for (const r of rules) {
    if (evaluateRule(r, cell)) return r;
  }
  return null;
}

/** Count matching rules across many cells. */
export function countMatches(rules: readonly FormatRule[], cells: readonly FormatCellInput[]): number {
  let n = 0;
  for (const c of cells) if (firstMatch(rules, c)) n++;
  return n;
}

/** Validate a rule's shape (cheap structural check). */
export function isRuleValid(rule: FormatRule): boolean {
  if (!rule.fieldId) return false;
  if (rule.op === 'between') {
    if (!Array.isArray(rule.value)) return false;
    const [a, b] = rule.value as [unknown, unknown];
    return typeof a === 'number' && typeof b === 'number' && a <= b;
  }
  if (rule.op === 'gt' || rule.op === 'lt') return typeof rule.value === 'number';
  return rule.value !== undefined;
}

/** Filter out invalid rules. */
export function filterValid(rules: readonly FormatRule[]): FormatRule[] {
  return rules.filter(isRuleValid);
}