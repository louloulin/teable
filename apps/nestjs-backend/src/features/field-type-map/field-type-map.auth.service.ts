/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Field type mapping matrix — NestJS auth service (Stage 85).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  coerce,
  defaultMatrix,
  isLossy,
  lookupMap,
  setMap,
  validateMap,
} from './field-type-map.service';
import type { FieldDataKind, IFieldTypeMap } from './field-type-map.types';

@Injectable()
export class FieldTypeMapAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** List all custom mappings for an org, merging with the default matrix. */
  async listForOrg(orgId: string): Promise<IFieldTypeMap[]> {
    const rows = await this.prisma.fieldTypeMap.findMany({ where: { orgId } });
    const customs = rows.map((r) => this.rowToMap(r));
    const merged = [...defaultMatrix()];
    for (const c of customs) merged.push(c);
    return merged;
  }

  /** Upsert a custom mapping for an org. */
  async upsert(input: {
    orgId: string;
    source: FieldDataKind;
    target: FieldDataKind;
    conversion: IFieldTypeMap['conversion'];
    lossless: boolean;
    notes?: string;
  }): Promise<IFieldTypeMap> {
    const entry: IFieldTypeMap = {
      source: input.source,
      target: input.target,
      conversion: input.conversion,
      lossless: input.lossless,
    };
    if (input.notes !== undefined) entry.notes = input.notes;
    const err = validateMap(entry);
    if (err) throw new Error(`invalid map: ${err}`);
    const id = `${input.orgId}:${input.source}:${input.target}`;
    await this.prisma.fieldTypeMap.upsert({
      where: { id },
      create: {
        id,
        orgId: input.orgId,
        source: input.source,
        target: input.target,
        conversion: input.conversion,
        lossless: input.lossless,
        notes: input.notes ?? null,
      },
      update: {
        conversion: input.conversion,
        lossless: input.lossless,
        notes: input.notes ?? null,
      },
    });
    return entry;
  }

  /** Coerce a batch of values through the org's mapping table. */
  async coerceBatch(input: {
    orgId: string;
    from: FieldDataKind;
    to: FieldDataKind;
    values: ReadonlyArray<unknown>;
  }): Promise<{ values: unknown[]; ok: boolean[] }> {
    const maps = await this.listForOrg(input.orgId);
    const ok: boolean[] = [];
    const values: unknown[] = [];
    for (const v of input.values) {
      const r = coerce({ maps, from: input.from, to: input.to, value: v });
      values.push(r.value);
      ok.push(r.ok);
    }
    return { values, ok };
  }

  /** Whether a (from,to) path is lossless. */
  async pathIsLossy(input: {
    orgId: string;
    from: FieldDataKind;
    to: FieldDataKind;
  }): Promise<boolean> {
    const maps = await this.listForOrg(input.orgId);
    return isLossy(maps, input.from, input.to);
  }

  lookupMap = lookupMap;
  defaultMatrix = defaultMatrix;
  setMap = setMap;
  validateMap = validateMap;

  private rowToMap(r: Record<string, unknown>): IFieldTypeMap {
    const out: IFieldTypeMap = {
      source: r['source'] as FieldDataKind,
      target: r['target'] as FieldDataKind,
      conversion: r['conversion'] as IFieldTypeMap['conversion'],
      lossless: Boolean(r['lossless']),
    };
    if (r['notes']) out.notes = String(r['notes']);
    return out;
  }
}
