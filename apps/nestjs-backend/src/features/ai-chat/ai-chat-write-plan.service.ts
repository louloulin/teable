import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@teable/db-main-prisma';
import type { ICreateRecordsRo, IUpdateRecordsRo } from '@teable/openapi';
import { PermissionService } from '../auth/permission.service';
import { RecordOpenApiService } from '../record/open-api/record-open-api.service';

export type AiChatWriteOperation = 'record_create' | 'record_update';
export type AiChatWritePlanStatus =
  | 'pending'
  | 'confirmed'
  | 'executing'
  | 'executed'
  | 'failed'
  | 'rejected'
  | 'expired';

export interface IAiChatWritePlanInput {
  sessionId: string;
  userId: string;
  tableId: string;
  operation: AiChatWriteOperation;
  summary: string;
  records: Array<{ id?: string; fields: Record<string, unknown> }>;
  fieldKeyType?: string;
  typecast?: boolean;
  expiresInSeconds?: number;
}

export interface IAiChatCuppyPlanInput {
  conversationId: string;
  userId: string;
  baseId: string;
  tableId: string;
  fields: Record<string, unknown>;
  fieldKeyType?: string;
}

const MAX_RECORDS = 50;
const MAX_PAYLOAD_BYTES = 100_000;
const DEFAULT_EXPIRY_SECONDS = 10 * 60;
const MAX_EXPIRY_SECONDS = 60 * 60;

@Injectable()
export class AiChatWritePlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
    private readonly recordOpenApiService: RecordOpenApiService
  ) {}

  static cuppySessionId(conversationId: string): string {
    return `aics_cuppy_${conversationId}`.slice(0, 191);
  }

  async create(input: IAiChatWritePlanInput) {
    const session = await this.getOwnedSession(input.sessionId, input.userId);
    await this.assertTable(input.tableId, session.baseId);
    await this.assertWritePermission(session.baseId, input.tableId, input.operation);
    this.validateInput(input);

    const id = `aiwp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const expiresInSeconds = Math.min(
      Math.max(input.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS, 30),
      MAX_EXPIRY_SECONDS
    );
    const payload = {
      fieldKeyType: input.fieldKeyType ?? 'name',
      typecast: input.typecast ?? false,
      records: input.records,
    };
    const row = await this.prisma.aiChatWritePlan.create({
      data: {
        id,
        sessionId: input.sessionId,
        userId: input.userId,
        baseId: session.baseId as string,
        tableId: input.tableId,
        operation: input.operation,
        payload: payload as Prisma.InputJsonValue,
        summary: input.summary.trim().slice(0, 500),
        status: 'pending',
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      },
    });
    return this.toView(row);
  }

  async createForCuppy(input: IAiChatCuppyPlanInput) {
    const sessionId = AiChatWritePlanService.cuppySessionId(input.conversationId);
    let session = await this.prisma.aiChatSession.findUnique({ where: { id: sessionId } });
    if (session && session.createdBy !== input.userId) {
      throw new NotFoundException('chat session not found');
    }
    if (!session) {
      try {
        session = await this.prisma.aiChatSession.create({
          data: {
            id: sessionId,
            baseId: input.baseId,
            tableId: input.tableId,
            model: 'cuppy',
            createdBy: input.userId,
          },
        });
      } catch {
        session = await this.prisma.aiChatSession.findUnique({ where: { id: sessionId } });
      }
    }
    if (!session || session.createdBy !== input.userId) {
      throw new NotFoundException('chat session not found');
    }
    return this.create({
      sessionId,
      userId: input.userId,
      tableId: input.tableId,
      operation: 'record_create',
      summary: `Cuppy 请求在表 ${input.tableId} 创建 1 条记录`,
      records: [{ fields: input.fields }],
      fieldKeyType: input.fieldKeyType,
    });
  }

  async list(sessionId: string, userId: string) {
    await this.getOwnedSession(sessionId, userId);
    const rows = await this.prisma.aiChatWritePlan.findMany({
      where: { sessionId, userId },
      orderBy: { createdTime: 'desc' },
      take: 50,
    });
    await this.expirePending(rows);
    return rows.map((row) => this.toView(row));
  }

  async listForCuppy(conversationId: string, userId: string) {
    const session = await this.prisma.aiChatSession.findFirst({
      where: { id: AiChatWritePlanService.cuppySessionId(conversationId), createdBy: userId },
      select: { id: true },
    });
    if (!session) return [];
    return this.list(session.id, userId);
  }

  async confirm(planId: string, userId: string) {
    const plan = await this.getOwnedPlan(planId, userId);
    const now = new Date();
    if (plan.expiresAt <= now && plan.status === 'pending') {
      await this.prisma.aiChatWritePlan.update({
        where: { id: planId },
        data: { status: 'expired' },
      });
      throw new BadRequestException('write plan has expired');
    }
    if (plan.status !== 'pending') {
      throw new BadRequestException(`write plan cannot be confirmed in status ${plan.status}`);
    }

    const session = await this.getOwnedSession(plan.sessionId, userId);
    await this.assertTable(plan.tableId, session.baseId);
    await this.assertWritePermission(
      session.baseId,
      plan.tableId,
      plan.operation as AiChatWriteOperation
    );

    const claimed = await this.prisma.aiChatWritePlan.updateMany({
      where: { id: planId, userId, status: 'pending', expiresAt: { gt: now } },
      data: { status: 'executing', confirmedBy: userId, confirmedTime: now },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('write plan was already confirmed or expired');
    }

    try {
      const payload = plan.payload as unknown as {
        fieldKeyType?: string;
        typecast?: boolean;
        records: Array<{ id?: string; fields: Record<string, unknown> }>;
      };
      const result =
        plan.operation === 'record_create'
          ? await this.recordOpenApiService.multipleCreateRecords(plan.tableId, {
              fieldKeyType: payload.fieldKeyType as ICreateRecordsRo['fieldKeyType'],
              typecast: payload.typecast,
              records: payload.records.map(({ fields }) => ({ fields })),
            })
          : await this.recordOpenApiService.updateRecords(plan.tableId, {
              fieldKeyType: payload.fieldKeyType as IUpdateRecordsRo['fieldKeyType'],
              typecast: payload.typecast,
              records: payload.records.map(({ id, fields }) => ({ id: id as string, fields })),
            });
      const completed = await this.prisma.aiChatWritePlan.update({
        where: { id: planId },
        data: {
          status: 'executed',
          executedTime: new Date(),
          result: result as unknown as Prisma.InputJsonValue,
        },
      });
      return this.toView(completed);
    } catch (error) {
      await this.prisma.aiChatWritePlan.update({
        where: { id: planId },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message.slice(0, 1000) : 'write failed',
        },
      });
      throw error;
    }
  }

  async confirmForCuppy(planId: string, conversationId: string, userId: string) {
    const plan = await this.getOwnedPlan(planId, userId);
    if (plan.sessionId !== AiChatWritePlanService.cuppySessionId(conversationId)) {
      throw new NotFoundException('write plan not found');
    }
    return this.confirm(planId, userId);
  }

  private validateInput(input: IAiChatWritePlanInput): void {
    if (!input.summary?.trim()) throw new BadRequestException('summary is required');
    if (!['record_create', 'record_update'].includes(input.operation)) {
      throw new BadRequestException('unsupported write operation');
    }
    if (!input.records.length || input.records.length > MAX_RECORDS) {
      throw new BadRequestException(`records must contain 1-${MAX_RECORDS} items`);
    }
    if (input.operation === 'record_update' && input.records.some((record) => !record.id)) {
      throw new BadRequestException('record_update requires record ids');
    }
    if (input.operation === 'record_create' && input.records.some((record) => record.id)) {
      throw new BadRequestException('record_create does not accept record ids');
    }
    if (Buffer.byteLength(JSON.stringify(input.records), 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new BadRequestException('write plan payload is too large');
    }
  }

  private async getOwnedSession(sessionId: string, userId: string) {
    const session = await this.prisma.aiChatSession.findFirst({
      where: { id: sessionId, createdBy: userId },
    });
    if (!session) throw new NotFoundException('chat session not found');
    if (!session.baseId) throw new BadRequestException('write plans require a base session');
    return session;
  }

  private async getOwnedPlan(planId: string, userId: string) {
    const plan = await this.prisma.aiChatWritePlan.findFirst({
      where: { id: planId, userId },
    });
    if (!plan) throw new NotFoundException('write plan not found');
    return plan;
  }

  private async assertTable(tableId: string, baseId: string | null) {
    const table = await this.prisma.tableMeta.findFirst({
      where: { id: tableId, baseId: baseId as string, deletedTime: null },
      select: { id: true },
    });
    if (!table) throw new NotFoundException('table not found in chat session base');
  }

  private async assertWritePermission(
    baseId: string | null,
    tableId: string,
    operation: AiChatWriteOperation
  ) {
    await this.permissionService.validPermissions(baseId as string, ['base|read']);
    await this.permissionService.validPermissions(tableId, [
      operation === 'record_create' ? 'record|create' : 'record|update',
    ]);
  }

  private async expirePending(rows: Array<{ id: string; status: string; expiresAt: Date }>) {
    const expired = rows.filter((row) => row.status === 'pending' && row.expiresAt <= new Date());
    await Promise.all(
      expired.map((row) =>
        this.prisma.aiChatWritePlan.updateMany({
          where: { id: row.id, status: 'pending' },
          data: { status: 'expired' },
        })
      )
    );
  }

  private toView(row: any) {
    return {
      id: row.id,
      sessionId: row.sessionId,
      baseId: row.baseId,
      tableId: row.tableId,
      operation: row.operation,
      summary: row.summary,
      status: row.status,
      expiresAt: row.expiresAt,
      confirmedBy: row.confirmedBy,
      confirmedTime: row.confirmedTime,
      executedTime: row.executedTime,
      result: row.result,
      errorMessage: row.errorMessage,
      createdTime: row.createdTime,
      updatedTime: row.updatedTime,
    };
  }
}
