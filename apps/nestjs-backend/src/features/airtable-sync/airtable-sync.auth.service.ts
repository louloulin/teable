import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  applyMappingUpdate,
  buildMappingRow,
  buildSyncRecordId,
  foldSyncRecords,
  hashFieldMap,
  isFieldMapStale,
  isValidDirection,
  isValidStatusTransition,
  parseFieldMap,
  resolveConflict,
  stringifyFieldMap,
} from './airtable-sync.service';
import type {
  IAirtableConnection,
  IAirtableFieldMap,
  IAirtableSyncLog,
  IAirtableSyncRecord,
  IAirtableTableMapping,
  ICreateConnectionInput,
  ICreateMappingInput,
  ISyncCandidate,
  ISyncDiffSummary,
  IUpdateMappingInput,
  MappingStatus,
  SyncDirection,
  SyncRecordState,
} from './airtable-sync.types';

@Injectable()
export class AirtableSyncAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async connect(input: ICreateConnectionInput): Promise<IAirtableConnection> {
    const dup = await this.prisma.airtableConnection.findUnique({
      where: {
        organizationId_baseId: { organizationId: input.organizationId, baseId: input.baseId },
      },
    });
    if (dup) throw new ConflictException(`connection exists: ${input.baseId}`);
    const id = `atc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.airtableConnection.create({
      data: {
        id,
        organizationId: input.organizationId,
        baseId: input.baseId,
        baseName: input.baseName,
        accessTokenJson: input.accessTokenJson,
        grantedScopes: input.grantedScopes ?? null,
        connectedBy: input.connectedBy,
      },
    });
    return toConnectionRow(row);
  }

  async revoke(organizationId: string, baseId: string): Promise<IAirtableConnection> {
    const existing = await this.prisma.airtableConnection.findUnique({
      where: { organizationId_baseId: { organizationId, baseId } },
    });
    if (!existing) throw new NotFoundException(`connection not found: ${baseId}`);
    const updated = await this.prisma.airtableConnection.update({
      where: { organizationId_baseId: { organizationId, baseId } },
      data: { revokedAt: new Date() },
    });
    return toConnectionRow(updated);
  }

  async getConnection(organizationId: string, baseId: string): Promise<IAirtableConnection | null> {
    const row = await this.prisma.airtableConnection.findUnique({
      where: { organizationId_baseId: { organizationId, baseId } },
    });
    return row ? toConnectionRow(row) : null;
  }

  async listConnections(organizationId: string): Promise<IAirtableConnection[]> {
    const rows = await this.prisma.airtableConnection.findMany({ where: { organizationId } });
    return rows.map(toConnectionRow);
  }

  async createMapping(input: ICreateMappingInput): Promise<IAirtableTableMapping> {
    if (!isValidDirection(input.direction ?? 'bi-directional')) {
      throw new BadRequestException('invalid direction');
    }
    const dup1 = await this.prisma.airtableTableMapping.findUnique({
      where: {
        connectionId_airtableTableId: {
          connectionId: input.connectionId,
          airtableTableId: input.airtableTableId,
        },
      },
    });
    if (dup1) throw new ConflictException('mapping exists for airtable table');
    const dup2 = await this.prisma.airtableTableMapping.findUnique({
      where: {
        connectionId_teableTableId: {
          connectionId: input.connectionId,
          teableTableId: input.teableTableId,
        },
      },
    });
    if (dup2) throw new ConflictException('mapping exists for teable table');
    const id = `atm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildMappingRow({ id, ...input });
    const created = await this.prisma.airtableTableMapping.create({
      data: {
        id: row.id,
        connectionId: row.connectionId,
        airtableTableId: row.airtableTableId,
        airtableTableName: row.airtableTableName,
        teableBaseId: row.teableBaseId,
        teableTableId: row.teableTableId,
        direction: row.direction,
        status: row.status,
        fieldMapJson: row.fieldMapJson,
        fieldMapHash: row.fieldMapHash,
      },
    });
    return toMappingRow(created);
  }

  async updateMapping(
    mappingId: string,
    update: IUpdateMappingInput
  ): Promise<IAirtableTableMapping> {
    const existing = await this.prisma.airtableTableMapping.findUnique({
      where: { id: mappingId },
    });
    if (!existing) throw new NotFoundException(`mapping not found: ${mappingId}`);
    if (update.direction && !isValidDirection(update.direction)) {
      throw new BadRequestException('invalid direction');
    }
    if (
      update.status &&
      !isValidStatusTransition(existing.status as MappingStatus, update.status)
    ) {
      throw new BadRequestException(
        `invalid status transition: ${existing.status} → ${update.status}`
      );
    }
    const merged = applyMappingUpdate(toMappingRow(existing), update);
    const updated = await this.prisma.airtableTableMapping.update({
      where: { id: mappingId },
      data: {
        direction: merged.direction,
        status: merged.status,
        fieldMapJson: merged.fieldMapJson,
        fieldMapHash: merged.fieldMapHash,
        lastErrorMessage: merged.lastErrorMessage,
      },
    });
    return toMappingRow(updated);
  }

  async deleteMapping(mappingId: string): Promise<void> {
    const existing = await this.prisma.airtableTableMapping.findUnique({
      where: { id: mappingId },
    });
    if (!existing) throw new NotFoundException(`mapping not found: ${mappingId}`);
    await this.prisma.airtableSyncRecord.deleteMany({ where: { mappingId } });
    await this.prisma.airtableSyncLog.deleteMany({ where: { mappingId } });
    await this.prisma.airtableTableMapping.delete({ where: { id: mappingId } });
  }

  async listMappings(connectionId: string): Promise<IAirtableTableMapping[]> {
    const rows = await this.prisma.airtableTableMapping.findMany({ where: { connectionId } });
    return rows.map(toMappingRow);
  }

  async getMapping(mappingId: string): Promise<IAirtableTableMapping | null> {
    const row = await this.prisma.airtableTableMapping.findUnique({ where: { id: mappingId } });
    return row ? toMappingRow(row) : null;
  }

  /** Helper exposed for callers that want the field map parsed from a mapping row. */
  parseFieldMap(fieldMapJson: string): IAirtableFieldMap {
    return parseFieldMap(fieldMapJson);
  }

  stringifyFieldMap(map: IAirtableFieldMap): string {
    return stringifyFieldMap(map);
  }

  hashFieldMap(map: IAirtableFieldMap): string {
    return hashFieldMap(map);
  }

  isFieldMapStale(input: { currentHash: string; incomingMap: IAirtableFieldMap }): boolean {
    return isFieldMapStale(input);
  }

  resolveConflict(c: ISyncCandidate): {
    winner: 'remote' | 'local' | 'tie';
    nextState: SyncRecordState;
  } {
    return resolveConflict(c);
  }

  foldSyncRecords(records: ReadonlyArray<IAirtableSyncRecord>): ISyncDiffSummary {
    return foldSyncRecords(records);
  }

  buildSyncRecordId(input: {
    mappingId: string;
    airtableRecordId: string;
    teableRecordId: string;
  }): string {
    return buildSyncRecordId(input);
  }

  async upsertSyncRecord(input: {
    mappingId: string;
    airtableRecordId: string;
    teableRecordId: string;
    state: SyncRecordState;
    remoteVersion?: number | null;
    localVersion?: number | null;
    contentHash?: string | null;
  }): Promise<IAirtableSyncRecord> {
    const id = buildSyncRecordId(input);
    const row = await this.prisma.airtableSyncRecord.upsert({
      where: { id },
      create: {
        id,
        mappingId: input.mappingId,
        airtableRecordId: input.airtableRecordId,
        teableRecordId: input.teableRecordId,
        state: input.state,
        lastRemoteVersion: input.remoteVersion ?? null,
        lastLocalVersion: input.localVersion ?? null,
        lastSyncedAt: new Date(),
        lastHash: input.contentHash ?? null,
      },
      update: {
        state: input.state,
        lastRemoteVersion: input.remoteVersion ?? null,
        lastLocalVersion: input.localVersion ?? null,
        lastSyncedAt: new Date(),
        lastHash: input.contentHash ?? null,
      },
    });
    return toSyncRecordRow(row);
  }

  async listSyncRecords(mappingId: string): Promise<IAirtableSyncRecord[]> {
    const rows = await this.prisma.airtableSyncRecord.findMany({ where: { mappingId } });
    return rows.map(toSyncRecordRow);
  }

  async startSyncRun(input: {
    mappingId: string;
    direction: 'push' | 'pull' | 'conflict-resolved';
  }): Promise<IAirtableSyncLog> {
    const id = `atsl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.airtableSyncLog.create({
      data: { id, mappingId: input.mappingId, direction: input.direction },
    });
    return toSyncLogRow(row);
  }

  async finishSyncRun(input: {
    runId: string;
    recordsExamined: number;
    recordsCreated: number;
    recordsUpdated: number;
    conflictsFound: number;
    status: 'ok' | 'failed' | 'partial';
    errorMessage?: string | null;
  }): Promise<IAirtableSyncLog> {
    const updated = await this.prisma.airtableSyncLog.update({
      where: { id: input.runId },
      data: {
        recordsExamined: input.recordsExamined,
        recordsCreated: input.recordsCreated,
        recordsUpdated: input.recordsUpdated,
        conflictsFound: input.conflictsFound,
        status: input.status,
        errorMessage: input.errorMessage ?? null,
        finishedAt: new Date(),
      },
    });
    return toSyncLogRow(updated);
  }

  async listSyncRuns(mappingId: string, limit = 50): Promise<IAirtableSyncLog[]> {
    const rows = await this.prisma.airtableSyncLog.findMany({
      where: { mappingId },
      orderBy: { startedAt: 'desc' },
      take: Math.min(limit, 1_000),
    });
    return rows.map(toSyncLogRow);
  }
}

function toConnectionRow(r: {
  id: string;
  organizationId: string;
  baseId: string;
  baseName: string;
  accessTokenJson: string;
  grantedScopes: string | null;
  connectedBy: string;
  connectedTime: Date;
  updatedTime: Date;
  revokedAt: Date | null;
}): IAirtableConnection {
  return {
    id: r.id,
    organizationId: r.organizationId,
    baseId: r.baseId,
    baseName: r.baseName,
    accessTokenJson: r.accessTokenJson,
    grantedScopes: r.grantedScopes,
    connectedBy: r.connectedBy,
    connectedTime: r.connectedTime,
    updatedTime: r.updatedTime,
    revokedAt: r.revokedAt,
  };
}

function toMappingRow(r: {
  id: string;
  connectionId: string;
  airtableTableId: string;
  airtableTableName: string;
  teableBaseId: string;
  teableTableId: string;
  direction: string;
  status: string;
  fieldMapJson: string;
  fieldMapHash: string;
  lastSyncedTime: Date | null;
  lastErrorMessage: string | null;
  createdTime: Date;
  updatedTime: Date;
}): IAirtableTableMapping {
  return {
    id: r.id,
    connectionId: r.connectionId,
    airtableTableId: r.airtableTableId,
    airtableTableName: r.airtableTableName,
    teableBaseId: r.teableBaseId,
    teableTableId: r.teableTableId,
    direction: r.direction as SyncDirection,
    status: r.status as MappingStatus,
    fieldMapJson: r.fieldMapJson,
    fieldMapHash: r.fieldMapHash,
    lastSyncedTime: r.lastSyncedTime,
    lastErrorMessage: r.lastErrorMessage,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}

function toSyncRecordRow(r: {
  id: string;
  mappingId: string;
  airtableRecordId: string;
  teableRecordId: string;
  state: string;
  lastRemoteVersion: number | null;
  lastLocalVersion: number | null;
  lastSyncedAt: Date | null;
  lastHash: string | null;
}): IAirtableSyncRecord {
  return {
    id: r.id,
    mappingId: r.mappingId,
    airtableRecordId: r.airtableRecordId,
    teableRecordId: r.teableRecordId,
    state: r.state as SyncRecordState,
    lastRemoteVersion: r.lastRemoteVersion,
    lastLocalVersion: r.lastLocalVersion,
    lastSyncedAt: r.lastSyncedAt,
    lastHash: r.lastHash,
  };
}

function toSyncLogRow(r: {
  id: string;
  mappingId: string;
  direction: string;
  recordsExamined: number;
  recordsCreated: number;
  recordsUpdated: number;
  conflictsFound: number;
  status: string;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}): IAirtableSyncLog {
  return {
    id: r.id,
    mappingId: r.mappingId,
    direction: r.direction as IAirtableSyncLog['direction'],
    recordsExamined: r.recordsExamined,
    recordsCreated: r.recordsCreated,
    recordsUpdated: r.recordsUpdated,
    conflictsFound: r.conflictsFound,
    status: r.status as IAirtableSyncLog['status'],
    errorMessage: r.errorMessage,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  };
}
