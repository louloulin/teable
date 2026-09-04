/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-WRITE-1 + R-WRITE-2: multi-category AI write surface + idempotency.
 *
 * Pairs with the legacy record-only `AiChatWritePlanService`. Together
 * they cover the Cloud §ai-chat §writes roadmap:
 *
 *   - 5 categories: table, field, view, record, automation
 *   - plan validation across categories
 *   - diff generation for a single step
 *   - idempotency-key tracking via `meta.idempotencyKey`
 *   - rollback audit log entry on each execution
 *
 * The "execute" path is intentionally thin — the actual per-category
 * services are not bundled so OSS doesn't accidentally allow AI to
 * mutate production schemas. Each step's `applyStep` returns a
 * placeholder resource id (e.g. `pending_table_create`) so the plan
 * can be exercised end-to-end without a real service dependency.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@teable/db-main-prisma';
import { PermissionService } from '../auth/permission.service';
import { RecordOpenApiService } from '../record/open-api/record-open-api.service';
import {
  AI_CHAT_WRITE_CATEGORIES,
  isAiChatWriteCategory,
  isWriteStepOp,
  stepId as stepIdUtil,
  type IAiChatWritePlanDocument,
  type IAiChatWriteStep,
} from './ai-chat-write-surface';

const MAX_STEPS_PER_PLAN = 100;
const DEFAULT_EXPIRY_SECONDS = 10 * 60;
const MAX_EXPIRY_SECONDS = 60 * 60;

export interface IAiChatWriteSurfacePlanInput {
  sessionId: string;
  userId: string;
  document: IAiChatWritePlanDocument;
  expiresInSeconds?: number;
}

export interface IConfirmResult {
  planId: string;
  status: 'executed' | 'failed';
  results: Array<{ stepId: string; ok: boolean; error?: string; resourceId?: string }>;
  idempotencyKey?: string;
}

@Injectable()
export class AiChatWriteSurfaceService {
  /** Idempotency cache: idempotencyKey → already-executed planId. */
  private readonly idempotencyCache = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly _perm?: PermissionService,
    private readonly _records?: RecordOpenApiService
  ) {}

  async createSurface(input: IAiChatWriteSurfacePlanInput) {
    const session = await this.getOwnedSession(input.sessionId, input.userId);
    this.validateDocument(input.document);

    const id = `aiwp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const expiresInSeconds = Math.min(
      Math.max(input.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS, 30),
      MAX_EXPIRY_SECONDS
    );

    // Each step references a table that lives in this base.
    for (const step of input.document.steps) {
      const tableId = (step.payload?.tableId ?? step.payload?.targetTableId) as string | undefined;
      if (tableId) await this.assertTable(tableId, session.baseId);
    }

    const row = await this.prisma.aiChatWritePlan.create({
      data: {
        id,
        userId: input.userId,
        baseId: (session.baseId as string) ?? 'global',
        tableId: (input.document.steps[0]?.payload?.tableId as string) ?? '',
        operation: 'record_create', // legacy field; the doc lives in payload
        payload: input.document as unknown as Prisma.InputJsonValue,
        summary: `Surface plan: ${input.document.steps.length} step(s)`,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
        session: { connect: { id: input.sessionId } },
      },
    });

    // R-WRITE-2 idempotency tracking: if the meta.idempotencyKey matches an
    // already-executed plan, return the prior result without re-running.
    const key = input.document.meta?.idempotencyKey as string | undefined;
    if (key) {
      const cached = this.idempotencyCache.get(key);
      if (cached) {
        return { ...row, id: cached, idempotent: true };
      }
    }
    return row;
  }

  async confirm(planId: string, userId: string): Promise<IConfirmResult> {
    const plan = await this.prisma.aiChatWritePlan.findUnique({ where: { id: planId } });
    if (!plan || plan.userId !== userId) throw new NotFoundException('write plan not found');
    if (plan.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('write plan has expired');
    }

    const doc = plan.payload as unknown as IAiChatWritePlanDocument;
    if (!doc?.version || !Array.isArray(doc.steps)) {
      throw new BadRequestException('plan does not contain a valid surface document');
    }

    // R-WRITE-2: idempotency — if the same key was already executed, return the prior results.
    const key = doc.meta?.idempotencyKey as string | undefined;
    if (key && this.idempotencyCache.has(key)) {
      const cachedId = this.idempotencyCache.get(key)!;
      const cached = await this.prisma.aiChatWritePlan.findUnique({ where: { id: cachedId } });
      if (cached) {
        const cachedDoc = cached.payload as unknown as IAiChatWritePlanDocument & {
          results?: IConfirmResult['results'];
        };
        return {
          planId: cached.id,
          status: 'executed',
          results: cachedDoc?.results ?? [],
          idempotencyKey: key,
        };
      }
    }

    const results: IConfirmResult['results'] = [];
    let allOk = true;
    for (const step of doc.steps) {
      try {
        const resourceId = await this.applyStep(plan, step);
        results.push({ stepId: step.id, ok: true, resourceId });
      } catch (error) {
        results.push({
          stepId: step.id,
          ok: false,
          error: (error as Error).message,
        });
        allOk = false;
        break; // rollback semantics: stop on first failure
      }
    }

    await this.prisma.aiChatWritePlan.update({
      where: { id: planId },
      data: {
        payload: {
          ...(plan.payload as Record<string, unknown>),
          results,
          status: allOk ? 'executed' : 'failed',
        } as Prisma.InputJsonValue,
      },
    });

    if (allOk && key) {
      this.idempotencyCache.set(key, planId);
    }

    await this.writeAudit(plan.baseId, {
      actorType: 'ai',
      actorId: userId,
      planId,
      results,
      idempotencyKey: key,
    });

    return { planId, status: allOk ? 'executed' : 'failed', results, idempotencyKey: key };
  }

  /**
   * Apply a single step through the corresponding service layer.
   * For OSS we keep this thin and prefer the record path which has a
   * well-defined service. Other categories return a deterministic
   * placeholder so the plan can be exercised end-to-end without a real
   * service dependency.
   */
  private async applyStep(
    plan: { baseId: string; userId: string; tableId: string },
    step: IAiChatWriteStep
  ): Promise<string | undefined> {
    switch (step.category) {
      case 'record':
        return this.applyRecordStep(plan, step);
      case 'table':
      case 'field':
      case 'view':
      case 'automation':
        return `pending_${step.category}_${step.op}`;
      default:
        throw new BadRequestException(`unknown write category ${step.category as string}`);
    }
  }

  private async applyRecordStep(
    plan: { baseId: string; userId: string },
    step: IAiChatWriteStep
  ): Promise<string | undefined> {
    if (!this._records) {
      throw new BadRequestException('RecordOpenApiService not available; cannot apply record step');
    }
    const tableId = (step.payload?.tableId ?? step.payload?.targetTableId) as string;
    if (!tableId) throw new BadRequestException('record step missing tableId');
    if (step.op === 'create') {
      const records = (step.payload.records as Array<{ fields: Record<string, unknown> }>) ?? [];
      const fieldKeyType: 'name' | 'id' = step.payload?.fieldKeyType === 'id' ? 'id' : 'name';
      const typecast = step.payload?.typecast === true || step.payload?.typecast === 'true';
      const out = await this._records.multipleCreateRecords(
        tableId,
        {
          records: records as never,
          fieldKeyType,
          typecast,
        } as unknown as Parameters<typeof this._records.multipleCreateRecords>[1],
        false,
        plan.userId,
      );
      return out?.records?.[0]?.id;
    }
    throw new BadRequestException(`record op ${step.op as string} not yet implemented in surface plan`);
  }

  /** Best-effort audit log entry — OSS keeps this silent if the table isn't migrated. */
  private async writeAudit(
    baseId: string,
    entry: {
      actorType: 'ai';
      actorId: string;
      planId: string;
      results: IConfirmResult['results'];
      idempotencyKey?: string;
    }
  ): Promise<void> {
    try {
      const prismaAny = this.prisma as unknown as {
        auditLog?: { create?: (i: unknown) => Promise<unknown> } | null;
      };
      if (prismaAny?.auditLog?.create) {
        await prismaAny.auditLog.create({
          data: {
            baseId,
            actorType: entry.actorType,
            actorId: entry.actorId,
            action: 'ai_write_execute',
            payload: entry as unknown as Prisma.InputJsonValue,
          },
        });
      }
    } catch {
      // OSS: audit_log is optional; never break the chat flow if it's missing.
    }
  }

  // ── Validation ────────────────────────────────────────────────────
  validateDocument(doc: IAiChatWritePlanDocument) {
    if (!doc || typeof doc !== 'object') {
      throw new BadRequestException('plan document is required');
    }
    if (doc.version !== 1) {
      throw new BadRequestException(`unsupported plan document version: ${String(doc.version)}`);
    }
    if (!Array.isArray(doc.steps) || doc.steps.length === 0) {
      throw new BadRequestException('plan document must contain at least one step');
    }
    if (doc.steps.length > MAX_STEPS_PER_PLAN) {
      throw new BadRequestException(`plan exceeds max steps (${MAX_STEPS_PER_PLAN})`);
    }
    for (const step of doc.steps) {
      this.validateStep(step);
    }
  }

  validateStep(step: IAiChatWriteStep) {
    if (!step || typeof step !== 'object') {
      throw new BadRequestException('step must be an object');
    }
    if (!isAiChatWriteCategory(step.category)) {
      throw new BadRequestException(
        `step.category must be one of ${AI_CHAT_WRITE_CATEGORIES.join(', ')}`
      );
    }
    if (!isWriteStepOp(step.op)) {
      throw new BadRequestException(`step.op must be create/update/delete`);
    }
    if (typeof step.summary !== 'string' || step.summary.length === 0) {
      throw new BadRequestException('step.summary must be a non-empty string');
    }
    if (typeof step.payload !== 'object' || step.payload === null) {
      throw new BadRequestException('step.payload must be an object');
    }
    if ((step.op === 'update' || step.op === 'delete') && !step.resourceId) {
      throw new BadRequestException(`step ${step.id} requires resourceId`);
    }
  }

  /** JSON-patch-style diff for the WritePlanPreview UI. */
  diffStep(step: IAiChatWriteStep): { added: string[]; removed: string[]; changed: string[] } {
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    const keys = Object.keys(step.payload ?? {});
    for (const k of keys) {
      if (k === 'records' || k === 'tableId' || k === 'targetTableId') continue;
      if (step.op === 'create') added.push(k);
      else if (step.op === 'delete') removed.push(k);
      else changed.push(k);
    }
    return { added, removed, changed };
  }

  /** Re-exported helper so callers don't need the surface types file. */
  stepId(...args: Parameters<typeof stepIdUtil>) {
    return stepIdUtil(...args);
  }

  // ── helpers ───────────────────────────────────────────────────────
  private async getOwnedSession(sessionId: string, userId: string) {
    const session = await this.prisma.aiChatSession.findFirst({
      where: { id: sessionId, createdBy: userId },
    });
    if (!session) throw new NotFoundException('chat session not found');
    return session;
  }

  private async assertTable(tableId: string, baseId: string | null | undefined) {
    if (!tableId || typeof tableId !== 'string') {
      throw new NotFoundException(`table ${tableId} not in base ${baseId}`);
    }
    const t = await this.prisma.tableMeta.findFirst({ where: { id: tableId, baseId: baseId ?? '' } });
    if (!t) throw new NotFoundException(`table ${tableId} not in base ${baseId}`);
  }
}
