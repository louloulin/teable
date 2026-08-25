/**
 * Module wiring — pure helpers (Stage 90).
 */

import type {
  FeatureModule,
  IModuleEntry,
  IWiringManifest,
} from './module-wiring.types';
import { FEATURE_MODULE_NAMES, MAX_MODULES } from './module-wiring.types';

/** Validate a single entry. */
export function validateEntry(e: IModuleEntry): string | null {
  if (!e.name) return 'name required';
  if (e.registered && !e.hasController) return `${e.name}: registered but no controller`;
  if (e.guarded && !e.hasController) return `${e.name}: guarded without controller`;
  return null;
}

/** Aggregate entries into a manifest. */
export function buildManifest(input: {
  entries: ReadonlyArray<IModuleEntry>;
  generatedAt: string;
}): IWiringManifest {
  const missing: FeatureModule[] = [];
  for (const name of FEATURE_MODULE_NAMES) {
    const e = input.entries.find((x) => x.name === name);
    if (!e || !e.registered) missing.push(name);
  }
  return {
    generatedAt: input.generatedAt,
    entries: input.entries.slice(-MAX_MODULES),
    missing,
  };
}

/** Whether the manifest covers every expected module. */
export function isComplete(m: IWiringManifest): boolean {
  return m.missing.length === 0;
}

/** Summary stats: how many modules registered / have controllers / are guarded. */
export function coverageStats(input: {
  entries: ReadonlyArray<IModuleEntry>;
}): { registered: number; withController: number; guarded: number } {
  let registered = 0;
  let withController = 0;
  let guarded = 0;
  for (const e of input.entries) {
    if (e.registered) registered++;
    if (e.hasController) withController++;
    if (e.guarded) guarded++;
  }
  return { registered, withController, guarded };
}

/** Diff two manifests and report newly registered modules. */
export function diffManifests(input: {
  before: ReadonlyArray<FeatureModule>;
  after: ReadonlyArray<IModuleEntry>;
}): FeatureModule[] {
  const before = new Set(input.before);
  return input.after.filter((e) => e.registered && !before.has(e.name)).map((e) => e.name);
}

/** Patch an entry — returns a new entry, leaving the input untouched. */
export function patchEntry(input: {
  current: IModuleEntry;
  patch: Partial<IModuleEntry>;
}): IModuleEntry {
  return { ...input.current, ...input.patch, name: input.current.name };
}
