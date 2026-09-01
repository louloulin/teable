/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Data DB connection — runtime service (Round-INFRA-5).
 *
 * Admin-facing registry backed by the real `DataDbConnection` Prisma model.
 * Secrets never cross this service's response boundary.
 *
 * License: AGPL-3.0
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { resolveDataDbInternalSchema } from '../space/data-db-internal-schema';
import {
  fingerprintDataDbConnection,
  getDatabaseUrlDisplayParts,
} from '../space/data-db-preflight.service';
import { encryptDataDbUrl } from '../space/data-db-url-secret';
import type { DataDbConnectionKind, IDataDbConnection } from './data-db-connection.types';

@Injectable()
export class DataDbConnectionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<IDataDbConnection[]> {
    const rows = await this.prisma.dataDbConnection.findMany({
      orderBy: { createdTime: 'desc' },
    });
    return rows.map(toConnection);
  }

  async create(input: {
    url: string;
    internalSchema?: string;
    createdBy: string;
  }): Promise<IDataDbConnection> {
    const url = new URL(input.url);
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
      throw new Error('Only PostgreSQL data database connections are supported');
    }
    const internalSchema = resolveDataDbInternalSchema(input.internalSchema, input.url);
    const display = getDatabaseUrlDisplayParts(input.url);
    const row = await this.prisma.dataDbConnection.create({
      data: {
        provider: 'postgres',
        encryptedUrl: encryptDataDbUrl(input.url),
        urlFingerprint: fingerprintDataDbConnection(input.url, internalSchema),
        displayHost: display.displayHost,
        displayDatabase: display.displayDatabase,
        internalSchema,
        status: 'pending',
        createdBy: input.createdBy,
      },
    });
    return toConnection(row);
  }

  async remove(id: string): Promise<boolean> {
    const existing = await this.prisma.dataDbConnection.findUnique({ where: { id } });
    if (!existing) return false;
    await this.prisma.spaceDataDbBinding.updateMany({
      where: { dataDbConnectionId: id },
      data: { dataDbConnectionId: null },
    });
    await this.prisma.dataDbConnection.delete({ where: { id } });
    return true;
  }

  async count(): Promise<number> {
    return (await this.list()).length;
  }
}

function toConnection(row: {
  id: string;
  provider: DataDbConnectionKind;
  displayHost: string | null;
  displayDatabase: string | null;
  internalSchema: string;
  status: string;
  schemaVersion: string | null;
  capabilities: unknown;
  lastValidatedAt: Date | null;
  lastError: string | null;
  createdBy: string;
  createdTime: Date;
  lastModifiedTime: Date | null;
}): IDataDbConnection {
  return {
    id: row.id,
    provider: row.provider,
    displayHost: row.displayHost,
    displayDatabase: row.displayDatabase,
    internalSchema: row.internalSchema,
    status: row.status,
    schemaVersion: row.schemaVersion,
    capabilities: row.capabilities,
    lastValidatedAt: row.lastValidatedAt,
    lastError: row.lastError,
    createdBy: row.createdBy,
    createdTime: row.createdTime,
    lastModifiedTime: row.lastModifiedTime,
  };
}
