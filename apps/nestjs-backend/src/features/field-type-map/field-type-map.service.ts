/**
 * Field type mapping matrix — pure helpers (Stage 85).
 */

import type { FieldConversion, FieldDataKind, IFieldTypeMap } from './field-type-map.types';
import { FIELD_DATA_KINDS, MAX_FIELD_MAPS } from './field-type-map.types';

/** Type guard. */
export function isFieldDataKind(s: string): s is FieldDataKind {
  return (FIELD_DATA_KINDS as ReadonlyArray<string>).includes(s);
}

/** Default mapping table: every (from,to) pair defaults to 'reject' except identity. */
export function defaultMatrix(): IFieldTypeMap[] {
  const out: IFieldTypeMap[] = [];
  for (const s of FIELD_DATA_KINDS) {
    for (const t of FIELD_DATA_KINDS) {
      const conv: FieldConversion = s === t ? 'direct' : 'reject';
      out.push({
        source: s,
        target: t,
        conversion: conv,
        lossless: conv === 'direct',
      });
    }
  }
  return out;
}

/** Look up a (source, target) entry from a list of maps. */
export function lookupMap(
  maps: ReadonlyArray<IFieldTypeMap>,
  source: FieldDataKind,
  target: FieldDataKind
): IFieldTypeMap | null {
  return maps.find((m) => m.source === source && m.target === target) ?? null;
}

/** Whether the path from `from` to `to` is lossless. */
export function isLossy(
  maps: ReadonlyArray<IFieldTypeMap>,
  from: FieldDataKind,
  to: FieldDataKind
): boolean {
  const m = lookupMap(maps, from, to);
  if (!m) return true;
  return !m.lossless;
}

/** Validate a single mapping entry. */
export function validateMap(m: IFieldTypeMap): string | null {
  if (!isFieldDataKind(m.source)) return `unknown source: ${m.source}`;
  if (!isFieldDataKind(m.target)) return `unknown target: ${m.target}`;
  if (m.source === m.target && m.conversion !== 'direct') return `identity map must be 'direct'`;
  if (m.conversion === 'reject' && m.lossless) return `reject conversion cannot be lossless`;
  return null;
}

/** Coerce a value from one kind to another using a mapping entry. */
export function coerce(input: {
  maps: ReadonlyArray<IFieldTypeMap>;
  from: FieldDataKind;
  to: FieldDataKind;
  value: unknown;
}): { value: unknown; ok: boolean } {
  const m = lookupMap(input.maps, input.from, input.to);
  if (!m || m.conversion === 'reject') return { value: input.value, ok: false };
  if (m.conversion === 'direct') return { value: input.value, ok: true };
  if (m.conversion === 'cast') return castCoerce(input);
  if (m.conversion === 'parse') return parseCoerce(input);
  if (m.conversion === 'serialize') return serializeCoerce(input);
  return { value: input.value, ok: false };
}

function castCoerce(input: { from: FieldDataKind; to: FieldDataKind; value: unknown }): {
  value: unknown;
  ok: boolean;
} {
  if (input.to === 'number') {
    const n = Number(input.value);
    return { value: n, ok: !Number.isNaN(n) };
  }
  if (input.to === 'integer') {
    const n = Number(input.value);
    return { value: Math.trunc(n), ok: !Number.isNaN(n) };
  }
  if (input.to === 'string') return { value: String(input.value), ok: true };
  if (input.to === 'boolean') return { value: Boolean(input.value), ok: true };
  return { value: input.value, ok: false };
}

function parseCoerce(input: { from: FieldDataKind; to: FieldDataKind; value: unknown }): {
  value: unknown;
  ok: boolean;
} {
  if (input.from === 'string' && (input.to === 'date' || input.to === 'datetime'))
    return parseDate(input);
  if (input.from === 'string' && input.to === 'json') return parseJson(input);
  return { value: input.value, ok: false };
}

function parseDate(input: { to: FieldDataKind; value: unknown }): {
  value: unknown;
  ok: boolean;
} {
  const d = new Date(String(input.value));
  if (Number.isNaN(d.getTime())) return { value: input.value, ok: false };
  const iso = d.toISOString();
  return { value: input.to === 'date' ? iso.slice(0, 10) : iso, ok: true };
}

function parseJson(input: { value: unknown }): { value: unknown; ok: boolean } {
  try {
    return { value: JSON.parse(String(input.value)), ok: true };
  } catch {
    return { value: input.value, ok: false };
  }
}

function serializeCoerce(input: { from: FieldDataKind; to: FieldDataKind; value: unknown }): {
  value: unknown;
  ok: boolean;
} {
  if (input.from === 'json' && input.to === 'string') {
    try {
      return { value: JSON.stringify(input.value), ok: true };
    } catch {
      return { value: input.value, ok: false };
    }
  }
  return { value: input.value, ok: false };
}

/** Add or replace a mapping entry. Returns a new list (immutable). */
export function setMap(input: {
  maps: ReadonlyArray<IFieldTypeMap>;
  entry: IFieldTypeMap;
}): IFieldTypeMap[] {
  const filtered = input.maps.filter(
    (m) => !(m.source === input.entry.source && m.target === input.entry.target)
  );
  return [...filtered, input.entry].slice(-MAX_FIELD_MAPS);
}
