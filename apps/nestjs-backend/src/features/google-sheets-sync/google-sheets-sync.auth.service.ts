import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildChannelRow,
  buildMappingRow,
  buildSyncRecordRow,
  deriveAllowedMutations,
  foldRun,
  hashRefreshToken,
  isValidDirection,
  isValidStatusTransition,
  resolveConflict,
} from './google-sheets-sync.service';
import type {
  ICreateConnectionInput,
  ICreateMappingInput,
  IGoogleSheetsConnection,
  IGoogleSheetsMapping,
  IGoogleSheetsSyncLog,
  IGoogleSheetsSyncRecord,
  IGoogleSheetsWebhookChannel,
  IRecordSyncStateInput,
  ISheetsFieldMap,
  SheetsMappingStatus,
  SheetsRunDirection,
  SheetsRunStatus,
  SheetsSyncDirection,
} from './google-sheets-sync.types';

@Injectable()
export class GoogleSheetsSyncAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async connect(input: ICreateConnectionInput): Promise<IGoogleSheetsConnection> {
    if (!input.refreshToken || input.refreshToken.length < 8) {
      throw new BadRequestException('refreshToken required');
    }
    const dup = await this.prisma.googleSheetsConnection.findFirst({
      where: { baseId: input.baseId, spreadsheetId: input.spreadsheetId },
    });
    if (dup && !dup.revokedAt) throw new BadRequestException('spreadsheet already connected');
    const id = `gsc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const created = await this.prisma.googleSheetsConnection.create({
      data: {
        id,
        organizationId: input.organizationId,
        baseId: input.baseId,
        spreadsheetId: input.spreadsheetId,
        spreadsheetTitle: input.spreadsheetTitle,
        refreshTokenHash: hashRefreshToken(input.refreshToken),
        serviceAccountEmail: input.serviceAccountEmail ?? null,
        connectedBy: input.connectedBy,
      },
    });
    return toConnection(created);
  }

  async revoke(connectionId: string): Promise<void> {
    const existing = await this.prisma.googleSheetsConnection.findUnique({
      where: { id: connectionId },
    });
    if (!existing) throw new NotFoundException(`connection not found: ${connectionId}`);
    await this.prisma.googleSheetsConnection.update({
      where: { id: connectionId },
      data: { revokedAt: new Date(), updatedTime: new Date() },
    });
  }

  async createMapping(input: ICreateMappingInput): Promise<IGoogleSheetsMapping> {
    if (!isValidDirection(input.direction)) throw new BadRequestException('invalid direction');
    const conn = await this.prisma.googleSheetsConnection.findUnique({
      where: { id: input.connectionId },
    });
    if (!conn) throw new NotFoundException(`connection not found: ${input.connectionId}`);
    if (conn.revokedAt) throw new BadRequestException('connection is revoked');
    const dup = await this.prisma.googleSheetsMapping.findFirst({
      where: { connectionId: input.connectionId, sheetId: input.sheetId },
    });
    if (dup) throw new BadRequestException(`sheet mapping exists: ${input.sheetTitle}`);
    const id = `gsm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildMappingRow({ id, ...input });
    const created = await this.prisma.googleSheetsMapping.create({
      data: {
        id: row.id,
        connectionId: row.connectionId,
        sheetId: row.sheetId,
        sheetTitle: row.sheetTitle,
        sheetGid: row.sheetGid,
        teableBaseId: row.teableBaseId,
        teableTableId: row.teableTableId,
        direction: row.direction,
        headerRow: row.headerRow,
        fieldMapJson: row.fieldMapJson,
        fieldMapHash: row.fieldMapHash,
      },
    });
    return toMapping(created);
  }

  async updateMappingDirection(
    mappingId: string,
    direction: SheetsSyncDirection
  ): Promise<IGoogleSheetsMapping> {
    if (!isValidDirection(direction)) throw new BadRequestException('invalid direction');
    const existing = await this.prisma.googleSheetsMapping.findUnique({ where: { id: mappingId } });
    if (!existing) throw new NotFoundException(`mapping not found: ${mappingId}`);
    const updated = await this.prisma.googleSheetsMapping.update({
      where: { id: mappingId },
      data: { direction },
    });
    return toMapping(updated);
  }

  async updateMappingStatus(
    mappingId: string,
    status: SheetsMappingStatus
  ): Promise<IGoogleSheetsMapping> {
    const existing = await this.prisma.googleSheetsMapping.findUnique({ where: { id: mappingId } });
    if (!existing) throw new NotFoundException(`mapping not found: ${mappingId}`);
    if (!isValidStatusTransition(existing.status as SheetsMappingStatus, status)) {
      throw new BadRequestException(`invalid transition: ${existing.status} → ${status}`);
    }
    const updated = await this.prisma.googleSheetsMapping.update({
      where: { id: mappingId },
      data: { status },
    });
    return toMapping(updated);
  }

  async deleteMapping(mappingId: string): Promise<void> {
    const existing = await this.prisma.googleSheetsMapping.findUnique({ where: { id: mappingId } });
    if (!existing) throw new NotFoundException(`mapping not found: ${mappingId}`);
    await this.prisma.googleSheetsSyncRecord.deleteMany({ where: { mappingId } });
    await this.prisma.googleSheetsMapping.delete({ where: { id: mappingId } });
  }

  async listMappings(baseId: string): Promise<IGoogleSheetsMapping[]> {
    const rows = await this.prisma.googleSheetsMapping.findMany({
      where: { teableBaseId: baseId },
    });
    return rows.map(toMapping);
  }

  async upsertSyncRecord(input: {
    mappingId: string;
    record: IRecordSyncStateInput;
  }): Promise<IGoogleSheetsSyncRecord> {
    const mapping = await this.prisma.googleSheetsMapping.findUnique({
      where: { id: input.mappingId },
    });
    if (!mapping) throw new NotFoundException(`mapping not found: ${input.mappingId}`);
    const id = `gsr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildSyncRecordRow({
      id,
      mappingId: input.mappingId,
      record: input.record,
      now: new Date(),
    });
    const created = await this.prisma.googleSheetsSyncRecord.create({
      data: {
        id: row.id,
        mappingId: row.mappingId,
        recordId: row.recordId,
        sheetsRowNumber: row.sheetsRowNumber,
        state: row.state,
      },
    });
    return toSyncRecord(created);
  }

  async startSyncRun(
    mappingId: string,
    direction: SheetsRunDirection
  ): Promise<IGoogleSheetsSyncLog> {
    const id = `gsl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const created = await this.prisma.googleSheetsSyncLog.create({
      data: { id, mappingId, direction, status: 'ok' },
    });
    return toSyncLog(created);
  }

  async finishSyncRun(input: {
    runId: string;
    status: SheetsRunStatus;
    rowsRead: number;
    rowsWritten: number;
    conflictsResolved: number;
    errorMessage?: string | null;
  }): Promise<IGoogleSheetsSyncLog> {
    const existing = await this.prisma.googleSheetsSyncLog.findUnique({
      where: { id: input.runId },
    });
    if (!existing) throw new NotFoundException(`run not found: ${input.runId}`);
    const updated = await this.prisma.googleSheetsSyncLog.update({
      where: { id: input.runId },
      data: {
        status: input.status,
        rowsRead: input.rowsRead,
        rowsWritten: input.rowsWritten,
        conflictsResolved: input.conflictsResolved,
        finishedAt: new Date(),
        errorMessage: input.errorMessage ?? null,
      },
    });
    return toSyncLog(updated);
  }

  async registerChannel(input: {
    resourceId: string;
    expiration: number;
    mappingId: string;
    connectionId: string;
  }): Promise<IGoogleSheetsWebhookChannel> {
    const channel = buildChannelRow(input);
    await this.prisma.googleSheetsWebhookChannel.upsert({
      where: { id: channel.id as unknown as string },
      create: { ...channel, id: channel.id as unknown as string },
      update: { expiration: channel.expiration, resourceId: channel.resourceId },
    });
    return channel;
  }

  deriveAllowedMutations = deriveAllowedMutations;
  resolveConflict = resolveConflict;
  foldRun = foldRun;
}

function toConnection(r: {
  id: string;
  organizationId: string;
  baseId: string;
  spreadsheetId: string;
  spreadsheetTitle: string;
  refreshTokenHash: string;
  serviceAccountEmail: string | null;
  connectedBy: string;
  connectedTime: Date;
  updatedTime: Date;
  revokedAt: Date | null;
}): IGoogleSheetsConnection {
  return {
    id: r.id,
    organizationId: r.organizationId,
    baseId: r.baseId,
    spreadsheetId: r.spreadsheetId,
    spreadsheetTitle: r.spreadsheetTitle,
    refreshTokenHash: r.refreshTokenHash,
    serviceAccountEmail: r.serviceAccountEmail,
    connectedBy: r.connectedBy,
    connectedTime: r.connectedTime,
    updatedTime: r.updatedTime,
    revokedAt: r.revokedAt,
  };
}

function toMapping(r: {
  id: string;
  connectionId: string;
  sheetId: string;
  sheetTitle: string;
  sheetGid: number;
  teableBaseId: string;
  teableTableId: string;
  direction: string;
  status: string;
  headerRow: number;
  fieldMapJson: string;
  fieldMapHash: string;
  lastSyncedTime: Date | null;
  lastErrorMessage: string | null;
  createdTime: Date;
}): IGoogleSheetsMapping {
  return {
    id: r.id,
    connectionId: r.connectionId,
    sheetId: r.sheetId,
    sheetTitle: r.sheetTitle,
    sheetGid: r.sheetGid,
    teableBaseId: r.teableBaseId,
    teableTableId: r.teableTableId,
    direction: r.direction as SheetsSyncDirection,
    status: r.status as SheetsMappingStatus,
    headerRow: r.headerRow,
    fieldMapJson: r.fieldMapJson,
    fieldMapHash: r.fieldMapHash,
    lastSyncedTime: r.lastSyncedTime,
    lastErrorMessage: r.lastErrorMessage,
    createdTime: r.createdTime,
  };
}

function toSyncRecord(r: {
  id: string;
  mappingId: string;
  recordId: string | null;
  sheetsRowNumber: number | null;
  state: string;
  localUpdatedAt: Date | null;
  remoteUpdatedAt: Date | null;
  lastSyncedAt: Date | null;
}): IGoogleSheetsSyncRecord {
  return {
    id: r.id,
    mappingId: r.mappingId,
    recordId: r.recordId,
    sheetsRowNumber: r.sheetsRowNumber,
    state: r.state as IGoogleSheetsSyncRecord['state'],
    localUpdatedAt: r.localUpdatedAt,
    remoteUpdatedAt: r.remoteUpdatedAt,
    lastSyncedAt: r.lastSyncedAt,
  };
}

function toSyncLog(r: {
  id: string;
  mappingId: string;
  direction: string;
  status: string;
  rowsRead: number;
  rowsWritten: number;
  conflictsResolved: number;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
}): IGoogleSheetsSyncLog {
  return {
    id: r.id,
    mappingId: r.mappingId,
    direction: r.direction as SheetsRunDirection,
    status: r.status as SheetsRunStatus,
    rowsRead: r.rowsRead,
    rowsWritten: r.rowsWritten,
    conflictsResolved: r.conflictsResolved,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    errorMessage: r.errorMessage,
  };
}
