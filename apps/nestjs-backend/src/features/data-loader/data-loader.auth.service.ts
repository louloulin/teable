/**
 * Data-loader — thin-DI wrapper (Stage 130).
 *
 * Auth-layer façade over the loader registry. Reads table metadata via
 * Prisma `findFirst` to confirm a table is registered with the loader
 * before allowing a fetch.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { dedupeKeys, decodeLoadKey, formatLoadKey } from './data-loader.helpers';
import type { IInspectResult, ILoadKey, LoadKeyKind } from './data-loader.types';

@Injectable()
export class DataLoaderAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inspect a list of read-keys. Reports which keys the loader registry
   * already has materialised and which ones would be a cold fetch.
   */
  async inspectLoad(readKeys: ReadonlyArray<ILoadKey>): Promise<IInspectResult> {
    const unique = dedupeKeys(readKeys);
    const known: ILoadKey[] = [];
    const missing: ILoadKey[] = [];
    for (const k of unique) {
      const registered = await this.isRegistered(k);
      if (registered) known.push(k);
      else missing.push(k);
    }
    return { requested: readKeys.length, unique, known, missing };
  }

  /** Encode a (kind, id) pair to the canonical composite. */
  encode(kind: LoadKeyKind, id: string): string {
    return formatLoadKey(kind, id);
  }

  /** Decode a composite back into structured form. */
  decode(composite: string): ILoadKey | null {
    return decodeLoadKey(composite);
  }

  private async isRegistered(k: ILoadKey): Promise<boolean> {
    if (k.kind === 'table') {
      const row = await this.prisma.tableMeta.findFirst({
        where: { id: k.id },
        select: { id: true },
      });
      return Boolean(row);
    }
    if (k.kind === 'view') {
      const row = await this.prisma.view.findFirst({
        where: { id: k.id },
        select: { id: true },
      });
      return Boolean(row);
    }
    // field
    const row = await this.prisma.field.findFirst({
      where: { id: k.id },
      select: { id: true },
    });
    return Boolean(row);
  }
}