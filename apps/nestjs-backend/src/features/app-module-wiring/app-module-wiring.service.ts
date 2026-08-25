/**
 * App module wiring — pure helpers (Stage 95).
 */

import type { IModuleWire, IWiringManifest } from './app-module-wiring.types';
import { MAX_MODULES } from './app-module-wiring.types';

/** Validate a single wire entry. */
export function validateWire(w: IModuleWire): string | null {
  if (!w.name) return 'name required';
  if (typeof w.round !== 'number' || w.round < 1) return 'round must be a positive number';
  if (!['core', 'infra', 'feature'].includes(w.category)) return 'unknown category';
  return null;
}

/** Build a manifest from wire entries, capped and deduped. */
export function buildManifest(input: {
  modules: ReadonlyArray<IModuleWire>;
}): IWiringManifest {
  const seen = new Set<string>();
  const out: IModuleWire[] = [];
  for (const w of input.modules) {
    if (out.length >= MAX_MODULES) break;
    if (seen.has(w.name)) continue;
    seen.add(w.name);
    const err = validateWire(w);
    if (err) throw new Error(`invalid module ${w.name}: ${err}`);
    out.push(w);
  }
  return { modules: out };
}

/** Find a wire entry by module name. */
export function findWire(input: {
  manifest: IWiringManifest;
  name: string;
}): IModuleWire | null {
  return input.manifest.modules.find((w) => w.name === input.name) ?? null;
}

/** Merge two manifests — second wins on conflict. */
export function mergeManifests(a: IWiringManifest, b: IWiringManifest): IWiringManifest {
  return buildManifest({ modules: [...a.modules, ...b.modules] });
}

/** Filter by category. */
export function filterByCategory(input: {
  manifest: IWiringManifest;
  category: 'core' | 'infra' | 'feature';
}): IModuleWire[] {
  return input.manifest.modules.filter((w) => w.category === input.category);
}

/** Filter by round. */
export function filterByRound(input: {
  manifest: IWiringManifest;
  round: number;
}): IModuleWire[] {
  return input.manifest.modules.filter((w) => w.round === input.round);
}

/** Required module names — modules with `required: true`. */
export function requiredNames(m: IWiringManifest): string[] {
  return m.modules.filter((w) => w.required).map((w) => w.name);
}

/** Check whether all required modules are present. */
export function hasAllRequired(input: {
  manifest: IWiringManifest;
  provided: ReadonlyArray<string>;
}): boolean {
  const set = new Set(input.provided);
  for (const r of requiredNames(input.manifest)) {
    if (!set.has(r)) return false;
  }
  return true;
}

/** Module names in install order: core → infra → feature. */
export function installOrder(m: IWiringManifest): string[] {
  const out: string[] = [];
  for (const cat of ['core', 'infra', 'feature'] as const) {
    for (const w of m.modules) {
      if (w.category === cat) out.push(w.name);
    }
  }
  return out;
}

/** Total count. */
export function count(m: IWiringManifest): number {
  return m.modules.length;
}