/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-WRITE-1 + R-WRITE-2: AI Chat write surface unit tests.
 *
 * Tests document validation + idempotency tracking without booting a
 * real Prisma client. The legacy record plan path is exercised by the
 * dedicated `ai-chat-write-plan.service.spec.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatWriteSurfaceService } from './ai-chat-write-surface.service';
import {
  AI_CHAT_WRITE_CATEGORIES,
  isAiChatWriteCategory,
  isWriteStepOp,
  stepId,
  type IAiChatWritePlanDocument,
} from './ai-chat-write-surface';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

interface IFakePrisma {
  aiChatSession: { findFirst: ReturnType<typeof vi.fn> };
  tableMeta: { findFirst: ReturnType<typeof vi.fn> };
  aiChatWritePlan: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  auditLog: { create: ReturnType<typeof vi.fn> } | null;
}

function makePrisma(): IFakePrisma {
  return {
    aiChatSession: { findFirst: vi.fn() },
    tableMeta: { findFirst: vi.fn() },
    aiChatWritePlan: {
      create: vi.fn(async (i: unknown) => ({ id: 'plan-1', ...(i as { data: Record<string, unknown> }).data, createdTime: new Date() })),
      findUnique: vi.fn(),
      update: vi.fn(async (i: unknown) => ({ id: (i as { where: { id: string } }).where.id })),
    },
    auditLog: { create: vi.fn() },
  };
}

function makeSvc(): { svc: AiChatWriteSurfaceService; prisma: IFakePrisma } {
  const prisma = makePrisma();
  const svc = new AiChatWriteSurfaceService(prisma as never);
  return { svc, prisma };
}

describe('AiChatWriteSurface (R-WRITE-1)', () => {
  it('exposes all 5 categories', () => {
    expect(AI_CHAT_WRITE_CATEGORIES).toEqual([
      'table',
      'field',
      'view',
      'record',
      'automation',
    ]);
  });

  it('isAiChatWriteCategory + isWriteStepOp validate taxonomy', () => {
    expect(isAiChatWriteCategory('record')).toBe(true);
    expect(isAiChatWriteCategory('not-a-category')).toBe(false);
    expect(isWriteStepOp('create')).toBe(true);
    expect(isWriteStepOp('patch')).toBe(false);
  });

  it('generates stable step ids for known shapes', () => {
    expect(stepId('table', 'create', 1)).toBe('table-create-1');
    expect(stepId('automation', 'delete', 42)).toBe('automation-delete-16');
  });

  it('createSurface builds an AiChatWritePlan row from a typed document', async () => {
    const { svc, prisma } = makeSvc();
    prisma.aiChatSession.findFirst.mockResolvedValue({
      id: 's1',
      baseId: 'b1',
      createdBy: 'u1',
    });
    prisma.tableMeta.findFirst.mockResolvedValue({ id: 't1', baseId: 'b1' });

    const doc: IAiChatWritePlanDocument = {
      version: 1,
      steps: [
        {
          id: stepId('record', 'create', 1),
          category: 'record',
          op: 'create',
          summary: 'add test record',
          payload: {
            tableId: 't1',
            records: [{ fields: { Name: 'X' } }],
            fieldKeyType: 'name',
          },
        },
      ],
      meta: { idempotencyKey: 'idem-test-1' },
    };

    const result = await svc.createSurface({
      sessionId: 's1',
      userId: 'u1',
      document: doc,
    });

    expect(result.id).toMatch(/^aiwp_/);
    expect(prisma.aiChatWritePlan.create).toHaveBeenCalledTimes(1);
    expect((result.payload as unknown as { version: number }).version).toBe(1);
  });

  it('rejects docs with unknown category', () => {
    const { svc } = makeSvc();
    expect(() =>
      svc.validateDocument({
        version: 1,
        steps: [
          {
            id: 'weird-1',
            category: 'banana' as unknown as 'record',
            op: 'create',
            summary: 'x',
            payload: {},
          },
        ],
      })
    ).toThrow();
  });

  it('rejects empty steps', () => {
    const { svc } = makeSvc();
    expect(() =>
      svc.validateDocument({ version: 1, steps: [] })
    ).toThrow();
  });

  it('rejects too many steps', () => {
    const { svc } = makeSvc();
    const steps = Array.from({ length: 101 }, (_, n) => ({
      id: stepId('record', 'create', n),
      category: 'record' as const,
      op: 'create' as const,
      summary: 'x',
      payload: { tableId: 't1' },
    }));
    expect(() =>
      svc.validateDocument({ version: 1, steps })
    ).toThrow();
  });

  it('requires resourceId for update/delete steps', () => {
    const { svc } = makeSvc();
    expect(() =>
      svc.validateDocument({
        version: 1,
        steps: [
          {
            id: stepId('record', 'update', 1),
            category: 'record',
            op: 'update',
            summary: 'rename record',
            payload: { tableId: 't1', fields: { Name: 'Y' } },
            // resourceId missing on purpose
          },
        ],
      })
    ).toThrow(/resourceId/);
  });

  it('diffStep produces added/removed/changed buckets', () => {
    const { svc } = makeSvc();
    const createStep = {
      id: 'x',
      category: 'table' as const,
      op: 'create' as const,
      summary: 'new table',
      payload: { name: 'Projects', fields: ['a', 'b'] },
    };
    const diffCreate = svc.diffStep(createStep);
    expect(diffCreate.added).toContain('name');
    expect(diffCreate.added).toContain('fields');

    const delStep = {
      id: 'y',
      category: 'field' as const,
      op: 'delete' as const,
      summary: 'drop field',
      payload: { fieldId: 'f1' },
    };
    const diffDel = svc.diffStep(delStep);
    expect(diffDel.removed).toContain('fieldId');
  });
});

// R-WRITE-1 + R-WRITE-2: confirm() — end-to-end coverage
//
// Each test seeds prisma.aiChatWritePlan.findUnique with the shape the
// confirm path expects: { id, userId, baseId, expiresAt, payload }.

function futureDate(): Date {
  return new Date(Date.now() + 10 * 60 * 1000);
}

function pastDate(): Date {
  return new Date(Date.now() - 60_000);
}

function makePlan(overrides: {
  id?: string;
  userId?: string;
  baseId?: string;
  expiresAt?: Date;
  steps?: unknown[];
  idempotencyKey?: string;
} = {}) {
  const doc: { version: 1; steps: unknown[]; meta?: Record<string, unknown> } = {
    version: 1,
    steps: overrides.steps ?? [
      {
        id: stepId('table', 'create', 1),
        category: 'table',
        op: 'create',
        summary: 'new table',
        payload: { name: 'Projects' },
      },
    ],
  };
  if (overrides.idempotencyKey) doc.meta = { idempotencyKey: overrides.idempotencyKey };
  return {
    id: overrides.id ?? 'plan-x',
    userId: overrides.userId ?? 'u1',
    baseId: overrides.baseId ?? 'b1',
    expiresAt: overrides.expiresAt ?? futureDate(),
    payload: doc,
  };
}

describe('AiChatWriteSurface.confirm (R-WRITE-1 + R-WRITE-2)', () => {
  it('returns NotFound when plan does not exist', async () => {
    const { svc, prisma } = makeSvc();
    prisma.aiChatWritePlan.findUnique.mockResolvedValue(null);
    await expect(svc.confirm('plan-missing', 'u1')).rejects.toThrow(/write plan not found/);
  });

  it('returns NotFound when plan belongs to a different user', async () => {
    const { svc, prisma } = makeSvc();
    prisma.aiChatWritePlan.findUnique.mockResolvedValue(makePlan({ userId: 'someone-else' }));
    await expect(svc.confirm('plan-x', 'u1')).rejects.toThrow(/write plan not found/);
  });

  it('rejects expired plans', async () => {
    const { svc, prisma } = makeSvc();
    prisma.aiChatWritePlan.findUnique.mockResolvedValue(makePlan({ expiresAt: pastDate() }));
    await expect(svc.confirm('plan-x', 'u1')).rejects.toThrow(/expired/);
  });

  it('rejects plans with malformed payload', async () => {
    const { svc, prisma } = makeSvc();
    prisma.aiChatWritePlan.findUnique.mockResolvedValue({
      id: 'plan-x',
      userId: 'u1',
      baseId: 'b1',
      expiresAt: futureDate(),
      payload: { version: 1 }, // missing steps
    });
    await expect(svc.confirm('plan-x', 'u1')).rejects.toThrow(/surface document/);
  });

  it('executes a single table step and writes audit', async () => {
    const { svc, prisma } = makeSvc();
    prisma.aiChatWritePlan.findUnique.mockResolvedValue(makePlan());
    const result = await svc.confirm('plan-x', 'u1');
    expect(result.planId).toBe('plan-x');
    expect(result.status).toBe('executed');
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ stepId: 'table-create-1', ok: true });
    expect(prisma.aiChatWritePlan.update).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog?.create).toHaveBeenCalledTimes(1);
  });

  it('stops on first failing step (rollback semantics)', async () => {
    const { svc, prisma } = makeSvc();
    // table step succeeds (returns pending_<cat>_<op>);
    // record step fails because no _records service is wired into this unit test.
    prisma.aiChatWritePlan.findUnique.mockResolvedValue(
      makePlan({
        steps: [
          { id: stepId('table', 'create', 1), category: 'table', op: 'create', summary: 'a', payload: { name: 'A' } },
          {
            id: stepId('record', 'create', 1),
            category: 'record',
            op: 'create',
            summary: 'r',
            payload: { tableId: 't1', records: [{ fields: { Name: 'X' } }] },
          },
        ],
      })
    );
    const result = await svc.confirm('plan-x', 'u1');
    expect(result.status).toBe('failed');
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({ ok: true });
    expect(result.results[1]).toMatchObject({ ok: false });
    expect(prisma.aiChatWritePlan.update).toHaveBeenCalled();
  });

  it('honors idempotencyKey on second confirm (R-WRITE-2)', async () => {
    const { svc, prisma } = makeSvc();
    const key = 'idem-A';
    // First confirm: plan exists, cache miss, execute.
    prisma.aiChatWritePlan.findUnique.mockResolvedValueOnce(
      makePlan({ id: 'plan-1', idempotencyKey: key })
    );
    const first = await svc.confirm('plan-1', 'u1');
    expect(first.status).toBe('executed');
    expect(first.planId).toBe('plan-1');
    // Second confirm with the SAME plan-1 + same key → idempotency cache hits.
    prisma.aiChatWritePlan.findUnique.mockResolvedValueOnce(
      makePlan({ id: 'plan-1', idempotencyKey: key })
    );
    const second = await svc.confirm('plan-1', 'u1');
    expect(second.planId).toBe('plan-1');
    expect(second.idempotencyKey).toBe(key);
    expect(second.status).toBe('executed');
  });

  it('covers 4 non-record categories (table/field/view/automation) through applyStep dispatch', async () => {
    const { svc, prisma } = makeSvc();
    // 'record' requires a wired RecordOpenApiService; covered by integration test instead.
    const cats = ['table', 'field', 'view', 'automation'] as const;
    const steps = cats.map((cat, i) => ({
      id: stepId(cat, 'create', i),
      category: cat,
      op: 'create' as const,
      summary: cat,
      payload: { name: cat },
    }));
    prisma.aiChatWritePlan.findUnique.mockResolvedValue(makePlan({ steps }));
    const result = await svc.confirm('plan-x', 'u1');
    expect(result.results).toHaveLength(4);
    expect(result.results.every((r) => r.ok)).toBe(true);
    // Each non-record step returns the deterministic pending_<cat>_<op> sentinel.
    expect(result.results[0].resourceId).toBe('pending_table_create');
    expect(result.results[1].resourceId).toBe('pending_field_create');
    expect(result.results[2].resourceId).toBe('pending_view_create');
    expect(result.results[3].resourceId).toBe('pending_automation_create');
  });

  it('writes audit_log with actorType=ai and idempotencyKey in payload', async () => {
    const { svc, prisma } = makeSvc();
    prisma.aiChatWritePlan.findUnique.mockResolvedValue(
      makePlan({ idempotencyKey: 'audit-key-1' })
    );
    await svc.confirm('plan-x', 'u1');
    expect(prisma.auditLog?.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorType: 'ai',
          actorId: 'u1',
          action: 'ai_write_execute',
          payload: expect.objectContaining({
            actorType: 'ai',
            actorId: 'u1',
            idempotencyKey: 'audit-key-1',
            planId: 'plan-x',
          }),
        }),
      })
    );
  });
});

