/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Per-base storage metering — NestJS auth service (Stage 81).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  appendSample,
  attributionFromLatest,
  attributeSamples,
  billableCents,
  billableLine,
  emptyByKind,
  normalizeAttribution,
  sumBillable,
  validateSample,
} from './storage-metering.service';
import type {
  IStorageAttribution,
  IStorageBillableLine,
  IStorageSample,
  StorageKind,
} from './storage-metering.types';

@Injectable()
export class StorageMeteringAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate and persist a sample, then return an updated attribution. */
  async recordSample(input: { sample: IStorageSample }): Promise<IStorageAttribution> {
    const err = validateSample(input.sample);
    if (err) throw new Error(`invalid sample: ${err}`);
    await this.prisma.storageSample.create({
      data: {
        id: input.sample.id,
        orgId: input.sample.orgId,
        baseId: input.sample.baseId,
        kind: input.sample.kind,
        bytes: BigInt(input.sample.bytes),
        endedAt: new Date(input.sample.endedAt),
      },
    });
    return this.computeAttribution({
      orgId: input.sample.orgId,
      baseId: input.sample.baseId,
    });
  }

  /** Compute an attribution for one base from latest samples. */
  async computeAttribution(input: { orgId: string; baseId: string }): Promise<IStorageAttribution> {
    const rows = await this.prisma.storageSample.findMany({
      where: { orgId: input.orgId, baseId: input.baseId },
      orderBy: { endedAt: 'desc' },
      take: 256,
    });
    const samples = rows.map((r) => this.rowToSample(r));
    return normalizeAttribution(
      attributionFromLatest({
        orgId: input.orgId,
        baseId: input.baseId,
        samples,
      })
    );
  }

  /** Compute billable lines across an org's bases. */
  async billableForOrg(orgId: string): Promise<IStorageBillableLine[]> {
    const bases = await this.prisma.storageSample.findMany({
      where: { orgId },
      select: { baseId: true },
      distinct: ['baseId'],
    });
    const out: IStorageBillableLine[] = [];
    for (const { baseId } of bases) {
      const attr = await this.computeAttribution({ orgId, baseId });
      out.push(billableLine(attr));
    }
    return out;
  }

  /** Persist a billable line (one row per base per cycle). */
  async persistLine(line: IStorageBillableLine): Promise<void> {
    await this.prisma.storageBillableLine.create({
      data: {
        id: `${line.orgId}:${line.baseId}:${Date.now()}`,
        orgId: line.orgId,
        baseId: line.baseId,
        bytes: BigInt(line.bytes),
        cents: line.cents,
      },
    });
  }

  /** Pure helpers re-exposed. */
  appendSample = appendSample;
  attributeSamples = attributeSamples;
  emptyByKind = emptyByKind;
  billableCents = billableCents;
  sumBillable = sumBillable;

  private rowToSample(r: Record<string, unknown>): IStorageSample {
    return {
      id: String(r['id']),
      orgId: String(r['orgId']),
      baseId: String(r['baseId']),
      kind: r['kind'] as StorageKind,
      bytes: Number(r['bytes']),
      endedAt: new Date(String(r['endedAt'])).toISOString(),
    };
  }
}
