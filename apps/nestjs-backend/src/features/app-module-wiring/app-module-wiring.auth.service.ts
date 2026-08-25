/* eslint-disable @typescript-eslint/naming-convention */
/**
 * App module wiring — NestJS auth service (Stage 95).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildManifest,
  count,
  filterByCategory,
  filterByRound,
  findWire,
  hasAllRequired,
  installOrder,
  mergeManifests,
  requiredNames,
} from './app-module-wiring.service';
import type { IModuleWire, IWiringManifest } from './app-module-wiring.types';

@Injectable()
export class AppModuleWiringAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert a wire entry. */
  async upsertWire(input: { wire: IModuleWire }): Promise<IModuleWire> {
    await this.prisma.appModuleWire.upsert({
      where: { id: input.wire.name },
      create: {
        id: input.wire.name,
        name: input.wire.name,
        category: input.wire.category,
        round: input.wire.round,
        required: input.wire.required,
      },
      update: {
        category: input.wire.category,
        round: input.wire.round,
        required: input.wire.required,
      },
    });
    return input.wire;
  }

  /** Load all wires into a manifest. */
  async loadManifest(): Promise<IWiringManifest> {
    const rows = await this.prisma.appModuleWire.findMany();
    const wires = rows.map(rowToWire);
    return buildManifest({ modules: wires });
  }

  /** Get install order — async persistence-aware. */
  async installOrder(): Promise<string[]> {
    const m = await this.loadManifest();
    return installOrder(m);
  }

  /** Total modules in manifest. */
  async count(): Promise<number> {
    const m = await this.loadManifest();
    return count(m);
  }

  /** Required module names. */
  async requiredNames(): Promise<string[]> {
    const m = await this.loadManifest();
    return requiredNames(m);
  }

  /** Validate that the provided module list covers all required wires. */
  async hasAllRequired(input: { provided: ReadonlyArray<string> }): Promise<boolean> {
    const m = await this.loadManifest();
    return hasAllRequired({ manifest: m, provided: input.provided });
  }

  /** Filter wires by category. */
  async filterByCategory(input: {
    category: 'core' | 'infra' | 'feature';
  }): Promise<IModuleWire[]> {
    const m = await this.loadManifest();
    return filterByCategory({ manifest: m, category: input.category });
  }

  /** Filter wires by round. */
  async filterByRound(input: { round: number }): Promise<IModuleWire[]> {
    const m = await this.loadManifest();
    return filterByRound({ manifest: m, round: input.round });
  }

  /** Find a single wire by name. */
  async findWire(input: { name: string }): Promise<IModuleWire | null> {
    const m = await this.loadManifest();
    return findWire({ manifest: m, name: input.name });
  }

  /** Merge with an additional set — used by feature flags to inject optional modules. */
  async mergeWithExtra(input: { extra: ReadonlyArray<IModuleWire> }): Promise<IWiringManifest> {
    const current = await this.loadManifest();
    return mergeManifests(current, buildManifest({ modules: input.extra }));
  }
}

function rowToWire(r: Record<string, unknown>): IModuleWire {
  return {
    name: String(r['name']),
    category: r['category'] as 'core' | 'infra' | 'feature',
    round: Number(r['round']),
    required: Boolean(r['required']),
  };
}