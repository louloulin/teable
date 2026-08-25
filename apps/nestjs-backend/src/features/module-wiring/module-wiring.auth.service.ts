/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Module wiring — NestJS auth service (Stage 90).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildManifest,
  coverageStats,
  diffManifests,
  patchEntry,
  validateEntry,
} from './module-wiring.service';
import type {
  FeatureModule,
  IModuleEntry,
  IWiringManifest,
} from './module-wiring.types';

@Injectable()
export class ModuleWiringAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert an entry. */
  async upsertEntry(input: { entry: IModuleEntry }): Promise<IModuleEntry> {
    const err = validateEntry(input.entry);
    if (err) throw new Error(err);
    await this.prisma.moduleEntry.upsert({
      where: { id: `${input.entry.name}` },
      create: {
        id: input.entry.name,
        name: input.entry.name,
        registered: input.entry.registered,
        hasController: input.entry.hasController,
        guarded: input.entry.guarded,
      },
      update: {
        registered: input.entry.registered,
        hasController: input.entry.hasController,
        guarded: input.entry.guarded,
      },
    });
    return input.entry;
  }

  /** Patch an entry. */
  async patchEntry(input: {
    name: FeatureModule;
    patch: Partial<IModuleEntry>;
  }): Promise<IModuleEntry> {
    const current = await this.loadEntry(input.name);
    if (!current) throw new Error(`module not found: ${input.name}`);
    const next = patchEntry({ current, patch: input.patch });
    return this.upsertEntry({ entry: next });
  }

  /** Load all entries and build a manifest. */
  async manifest(now: string): Promise<IWiringManifest> {
    const rows = await this.prisma.moduleEntry.findMany();
    const entries = rows.map(rowToEntry);
    return buildManifest({ entries, generatedAt: now });
  }

  /** Coverage stats over the persisted set. */
  async coverage(): Promise<{ registered: number; withController: number; guarded: number }> {
    const rows = await this.prisma.moduleEntry.findMany();
    return coverageStats({ entries: rows.map(rowToEntry) });
  }

  /** Diff manifest against a prior snapshot of registered names. */
  async diffSince(before: ReadonlyArray<FeatureModule>): Promise<FeatureModule[]> {
    const rows = await this.prisma.moduleEntry.findMany();
    return diffManifests({ before, after: rows.map(rowToEntry) });
  }

  /** Load a single entry. */
  async loadEntry(name: FeatureModule): Promise<IModuleEntry | null> {
    const row = await this.prisma.moduleEntry.findUnique({ where: { id: name } });
    return row ? rowToEntry(row) : null;
  }
}

function rowToEntry(r: Record<string, unknown>): IModuleEntry {
  return {
    name: String(r['name']) as FeatureModule,
    registered: Boolean(r['registered']),
    hasController: Boolean(r['hasController']),
    guarded: Boolean(r['guarded']),
  };
}
