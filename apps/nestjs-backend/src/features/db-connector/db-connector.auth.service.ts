import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  canStartSync,
  deriveSyncStatus,
  isManualRunAllowed,
  isValidKind,
  isValidSyncMode,
  validateCreateInput,
  validateStartSyncInput,
} from './db-connector.service';
import type {
  DbConnectorKind,
  DbConnectorSyncMode,
  DbConnectorSyncStatus,
  ICreateConnectorInput,
  IDbConnector,
  IDbConnectorSync,
  IStartSyncInput,
} from './db-connector.types';

@Injectable()
export class DbConnectorAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async createConnector(input: ICreateConnectorInput): Promise<IDbConnector> {
    validateCreateInput(input);
    const id = `dbc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.dbConnector.create({
      data: {
        id,
        baseId: input.baseId,
        name: input.name.trim(),
        kind: input.kind,
        encryptedConfigJson: JSON.stringify(input.config),
        incrementalField: input.incrementalField ?? null,
        schedule: input.schedule ?? '',
        targetTableId: input.targetTableId ?? '',
        enabled: input.enabled ?? true,
      },
    });
    return toConnector(row);
  }

  async listConnectors(baseId: string, kind?: DbConnectorKind): Promise<IDbConnector[]> {
    const where: Record<string, unknown> = { baseId };
    if (kind) where['kind'] = kind;
    const rows = await this.prisma.dbConnector.findMany({ where });
    return rows.map(toConnector);
  }

  async getConnector(id: string): Promise<IDbConnector> {
    const row = await this.prisma.dbConnector.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`connector not found: ${id}`);
    return toConnector(row);
  }

  async updateConnector(
    id: string,
    patch: Partial<
      Pick<
        ICreateConnectorInput,
        'name' | 'config' | 'incrementalField' | 'schedule' | 'targetTableId' | 'enabled'
      >
    >
  ): Promise<IDbConnector> {
    const existing = await this.prisma.dbConnector.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`connector not found: ${id}`);
    if (patch.name !== undefined && patch.name.trim().length === 0) {
      throw new BadRequestException('name cannot be empty');
    }
    const updated = await this.prisma.dbConnector.update({
      where: { id },
      data: {
        name: patch.name ?? undefined,
        encryptedConfigJson: patch.config !== undefined ? JSON.stringify(patch.config) : undefined,
        incrementalField: patch.incrementalField ?? undefined,
        schedule: patch.schedule ?? undefined,
        targetTableId: patch.targetTableId ?? undefined,
        enabled: patch.enabled ?? undefined,
      },
    });
    return toConnector(updated);
  }

  async deleteConnector(id: string): Promise<void> {
    const existing = await this.prisma.dbConnector.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`connector not found: ${id}`);
    await this.prisma.dbConnector.delete({ where: { id } });
  }

  async startSync(input: IStartSyncInput): Promise<IDbConnectorSync> {
    validateStartSyncInput(input);
    const connector = await this.prisma.dbConnector.findUnique({
      where: { id: input.connectorId },
    });
    if (!connector) throw new NotFoundException(`connector not found: ${input.connectorId}`);
    const lastSync = await this.lastSyncFor(input.connectorId);
    const guard = canStartSync(toConnector(connector), lastSync);
    if (!guard.ok) throw new BadRequestException(`cannot start sync: ${guard.reason}`);
    const id = `dbs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.dbConnectorSync.create({
      data: {
        id,
        connectorId: input.connectorId,
        mode: input.mode ?? 'manual',
        status: 'running',
        rowsFetched: 0,
        rowsWritten: 0,
        startedAt: new Date(),
        triggeredBy: input.triggeredBy,
      },
    });
    return toSync(row);
  }

  async finishSync(
    syncId: string,
    result: { rowsFetched: number; rowsWritten: number; error?: string }
  ): Promise<IDbConnectorSync> {
    const existing = await this.prisma.dbConnectorSync.findUnique({ where: { id: syncId } });
    if (!existing) throw new NotFoundException(`sync not found: ${syncId}`);
    if (existing.status !== 'running') {
      throw new BadRequestException(`sync already finalized: ${existing.status}`);
    }
    const status = deriveSyncStatus(result.rowsFetched, result.rowsWritten, Boolean(result.error));
    const now = new Date();
    const updated = await this.prisma.dbConnectorSync.update({
      where: { id: syncId },
      data: {
        status,
        rowsFetched: result.rowsFetched,
        rowsWritten: result.rowsWritten,
        finishedAt: now,
        errorMessage: result.error ?? null,
      },
    });
    await this.prisma.dbConnector.update({
      where: { id: existing.connectorId },
      data: { lastSyncAt: now },
    });
    return toSync(updated);
  }

  async cancelSync(syncId: string): Promise<IDbConnectorSync> {
    const existing = await this.prisma.dbConnectorSync.findUnique({ where: { id: syncId } });
    if (!existing) throw new NotFoundException(`sync not found: ${syncId}`);
    if (existing.status !== 'running') {
      throw new BadRequestException(`sync not running: ${existing.status}`);
    }
    const updated = await this.prisma.dbConnectorSync.update({
      where: { id: syncId },
      data: { status: 'cancelled', finishedAt: new Date() },
    });
    return toSync(updated);
  }

  async listSyncs(connectorId: string, limit: number = 50): Promise<IDbConnectorSync[]> {
    const rows = await this.prisma.dbConnectorSync.findMany({
      where: { connectorId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return rows.map(toSync);
  }

  async getSync(syncId: string): Promise<IDbConnectorSync> {
    const row = await this.prisma.dbConnectorSync.findUnique({ where: { id: syncId } });
    if (!row) throw new NotFoundException(`sync not found: ${syncId}`);
    return toSync(row);
  }

  async lastSyncFor(connectorId: string): Promise<IDbConnectorSync | undefined> {
    const row = await this.prisma.dbConnectorSync.findFirst({
      where: { connectorId },
      orderBy: { startedAt: 'desc' },
    });
    return row ? toSync(row) : undefined;
  }

  isValidKind = isValidKind;
  isValidSyncMode = isValidSyncMode;
  isManualRunAllowed = isManualRunAllowed;
}

function toConnector(r: {
  id: string;
  baseId: string;
  name: string;
  kind: string;
  encryptedConfigJson: string;
  incrementalField: string | null;
  schedule: string;
  targetTableId: string;
  enabled: boolean;
  lastSyncAt: Date | null;
  createdTime: Date;
  updatedTime: Date;
}): IDbConnector {
  return {
    id: r.id,
    baseId: r.baseId,
    name: r.name,
    kind: r.kind as DbConnectorKind,
    encryptedConfigJson: r.encryptedConfigJson,
    incrementalField: r.incrementalField ?? undefined,
    schedule: r.schedule,
    targetTableId: r.targetTableId,
    enabled: r.enabled,
    lastSyncAt: r.lastSyncAt ?? undefined,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}

function toSync(r: {
  id: string;
  connectorId: string;
  mode: string;
  status: string;
  rowsFetched: number;
  rowsWritten: number;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
}): IDbConnectorSync {
  return {
    id: r.id,
    connectorId: r.connectorId,
    mode: r.mode as DbConnectorSyncMode,
    status: r.status as DbConnectorSyncStatus,
    rowsFetched: r.rowsFetched,
    rowsWritten: r.rowsWritten,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt ?? undefined,
    errorMessage: r.errorMessage ?? undefined,
  };
}
