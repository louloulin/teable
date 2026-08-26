/**
 * Data-loader — thin-DI wrapper helpers (Stage 130).
 *
 * Pure key-encoding / dedupe helpers. No Nest DI surface.
 */

import type { ILoadKey, LoadKeyKind } from './data-loader.types';

/** Build the canonical composite key used by the loader registry. */
export function formatLoadKey(kind: LoadKeyKind, id: string): string {
  return `${kind}:${id}`;
}

/** Decode a composite back into its parts (returns null on malformed). */
export function decodeLoadKey(composite: string): ILoadKey | null {
  const at = composite.indexOf(':');
  if (at <= 0 || at === composite.length - 1) return null;
  const kind = composite.slice(0, at) as LoadKeyKind;
  const id = composite.slice(at + 1);
  if (kind !== 'field' && kind !== 'table' && kind !== 'view') return null;
  return { kind, id, composite };
}

/** Dedupe load keys preserving first-seen order. */
export function dedupeKeys(keys: ReadonlyArray<ILoadKey>): ILoadKey[] {
  const seen = new Set<string>();
  const out: ILoadKey[] = [];
  for (const k of keys) {
    if (!seen.has(k.composite)) {
      seen.add(k.composite);
      out.push(k);
    }
  }
  return out;
}