/**
 * Env config — pure helpers (Stage 96).
 */

import type { IEnvReport, IEnvSpec } from './env-config.types';
import { MAX_ENV_SPECS, MAX_ENV_VALUE_LENGTH } from './env-config.types';

const KINDS = new Set(['string', 'number', 'boolean', 'enum']);

/** Validate an env spec. */
export function validateEnvSpec(s: IEnvSpec): string | null {
  if (!s.name) return 'name required';
  if (!KINDS.has(s.kind)) return `unknown kind: ${s.kind}`;
  if (s.kind === 'enum' && (!s.enumValues || s.enumValues.length === 0)) {
    return 'enum requires enumValues';
  }
  return null;
}

/** Resolve one env spec against a provided env map. */
export function resolveOne(spec: IEnvSpec, env: Record<string, string | undefined>): {
  value: string | number | boolean;
  issue: string | null;
} {
  const raw = env[spec.name];
  if (raw === undefined || raw === null || raw === '') {
    if (spec.required && (spec.default === undefined || spec.default === null)) {
      return { value: '', issue: `${spec.name}: required but unset` };
    }
    if (spec.default !== undefined && spec.default !== null) {
      return { value: spec.default, issue: null };
    }
    return { value: '', issue: `${spec.name}: optional but no default` };
  }
  if (raw.length > MAX_ENV_VALUE_LENGTH) {
    return { value: '', issue: `${spec.name}: value too long` };
  }
  return { value: parseValue(spec, raw), issue: null };
}

function parseValue(spec: IEnvSpec, raw: string): string | number | boolean {
  switch (spec.kind) {
    case 'string':
      return raw;
    case 'number':
      return Number(raw);
    case 'boolean':
      return raw === 'true' || raw === '1';
    case 'enum':
      return raw;
    default:
      return raw;
  }
}

/** Resolve all specs and produce a report. */
export function resolveAll(input: {
  specs: ReadonlyArray<IEnvSpec>;
  env: Record<string, string | undefined>;
}): IEnvReport {
  const issues: string[] = [];
  const values: Record<string, string | number | boolean> = {};
  const specs = input.specs.slice(0, MAX_ENV_SPECS);
  for (const s of specs) {
    const err = validateEnvSpec(s);
    if (err) {
      issues.push(`${s.name}: ${err}`);
      continue;
    }
    const { value, issue } = resolveOne(s, input.env);
    if (issue) issues.push(issue);
    else values[s.name] = value;
  }
  return { valid: issues.length === 0, issues, values };
}

/** Get required value, throws if missing. */
export function required(input: { name: string; env: Record<string, string | undefined> }): string {
  const v = input.env[input.name];
  if (!v) throw new Error(`env ${input.name} is required`);
  return v;
}

/** Get optional value with default. */
export function optional(input: {
  name: string;
  env: Record<string, string | undefined>;
  fallback: string;
}): string {
  return input.env[input.name] ?? input.fallback;
}

/** Boolean env: true/false/1/0. */
export function boolEnv(input: {
  name: string;
  env: Record<string, string | undefined>;
  fallback?: boolean;
}): boolean {
  const v = input.env[input.name];
  if (v === undefined) return input.fallback ?? false;
  return v === 'true' || v === '1';
}

/** Number env with fallback. */
export function numberEnv(input: {
  name: string;
  env: Record<string, string | undefined>;
  fallback: number;
}): number {
  const v = input.env[input.name];
  if (v === undefined) return input.fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`env ${input.name} is not a number: ${v}`);
  return n;
}

/** Build a startup banner string. */
export function banner(report: IEnvReport): string {
  const lines: string[] = [];
  lines.push(`env: ${report.valid ? 'valid' : 'invalid'}`);
  for (const [k, v] of Object.entries(report.values)) {
    lines.push(`  ${k}=${v}`);
  }
  for (const issue of report.issues) lines.push(`! ${issue}`);
  return lines.join('\n');
}