/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Pin — NestJS thin-DI auth service (Stage N).
 *
 * Auth-only entry point for the pin system: a single `resolvePin` method
 * that looks up a pin by `(tableId, recordId)` and returns the validated
 * record. Uses only `findFirst` against Prisma; the full pin lifecycle
 * stays in `PinService`.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { normalizePinRecordId } from './pin.helpers';
import type { IPinRecord, IValidatedPin } from './pin.types';

@Injectable()
export class PinAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async resolvePin(tableId: string, recordId: string): Promise<IValidatedPin> {
    const normalized = normalizePinRecordId(recordId);
    const row = await this.prisma.pin.findFirst({
      where: { tableId, recordId: normalized },
      select: {
        id: true,
        tableId: true,
        recordId: true,
        userId: true,
        lastUsedTime: true,
      },
    });
    if (!row) {
      throw new NotFoundException('pin not found');
    }
    const record: IPinRecord = {
      id: row.id,
      tableId: row.tableId,
      recordId: row.recordId,
      userId: row.userId,
      lastUsedTime: row.lastUsedTime,
    };
    return {
      tableId: record.tableId,
      recordId: record.recordId,
      userId: record.userId,
      lastUsedTime: record.lastUsedTime?.toISOString() ?? null,
    };
  }
}