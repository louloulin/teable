/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { LLM_PROVIDER } from './ai-builder.auth.service';
import { AiBuilderAuthService } from './ai-builder.auth.service';

interface IMockAiBuilderProposal {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

interface IMockPrisma {
  aiBuilderProposal: IMockAiBuilderProposal;
}

const buildPrisma = (): IMockPrisma => ({
  aiBuilderProposal: {
    create: vi.fn(async ({ data }) => ({
      id: data.id,
      baseId: data.baseId,
      status: data.status,
      sourcePrompt: data.sourcePrompt,
      proposalJson: data.proposalJson,
      proposalHash: data.proposalHash,
      model: data.model,
      createdBy: data.createdBy,
      createdTime: new Date(),
      approvedBy: null,
      approvedTime: null,
      appliedResourceId: null,
    })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    update: vi.fn(async ({ where, data }) => ({
      id: where.id,
      status: data.status,
      approvedBy: data.approvedBy ?? null,
      approvedTime: data.approvedTime ?? null,
      appliedResourceId: data.appliedResourceId ?? null,
    })),
  },
});

const fakeProvider = {
  complete: vi.fn(async () =>
    JSON.stringify({
      entityType: 'table',
      title: 'Tasks',
      rationale: '',
      confidence: 0.5,
      payload: {
        name: 'tasks',
        primaryFieldName: 'title',
        fields: [{ name: 'title', type: 'singleLineText' }],
      },
    })
  ),
};

const buildSvc = () => {
  const prisma = buildPrisma();
  const svc = new AiBuilderAuthService(prisma as never, fakeProvider as never);
  return { svc, prisma };
};

describe('AiBuilderAuthService (Stage 30)', () => {
  it('creates a proposal using the injected LLM provider', async () => {
    const { svc, prisma } = buildSvc();
    const row = await svc.createProposal({
      baseId: 'b',
      sourcePrompt: 'A task tracker with due dates',
      createdBy: 'u1',
    });
    expect(row.status).toBe('draft');
    expect(row.proposalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(fakeProvider.complete).toHaveBeenCalledTimes(1);
    expect(prisma.aiBuilderProposal.create).toHaveBeenCalledTimes(1);
  });

  it('rejects prompts that are too short', async () => {
    const { svc } = buildSvc();
    await expect(
      svc.createProposal({ baseId: 'b', sourcePrompt: 'hi', createdBy: 'u1' })
    ).rejects.toThrow();
  });

  it('rejects invalid LLM JSON with BadRequest', async () => {
    const broken = {
      complete: vi.fn(async () => 'not json at all'),
    } as never;
    const prisma = buildPrisma();
    const svc = new AiBuilderAuthService(prisma as never, broken);
    await expect(
      svc.createProposal({ baseId: 'b', sourcePrompt: 'a real prompt', createdBy: 'u1' })
    ).rejects.toThrow(/proposal invalid/);
  });

  it('approves a draft proposal by its author', async () => {
    const prisma = buildPrisma();
    prisma.aiBuilderProposal.findUnique.mockResolvedValueOnce({
      id: 'p1',
      status: 'draft',
      createdBy: 'u1',
    } as never);
    const svc = new AiBuilderAuthService(prisma as never, fakeProvider as never);
    const updated = await svc.approve({ proposalId: 'p1', approvedBy: 'u1' });
    expect(updated.status).toBe('approved');
  });

  it('rejects approval by a non-author', async () => {
    const prisma = buildPrisma();
    prisma.aiBuilderProposal.findUnique.mockResolvedValueOnce({
      id: 'p1',
      status: 'draft',
      createdBy: 'u1',
    } as never);
    const svc = new AiBuilderAuthService(prisma as never, fakeProvider as never);
    await expect(svc.approve({ proposalId: 'p1', approvedBy: 'u2' })).rejects.toThrow();
  });

  it('rejects illegal status transitions', async () => {
    const prisma = buildPrisma();
    prisma.aiBuilderProposal.findUnique.mockResolvedValueOnce({
      id: 'p1',
      status: 'applied',
      createdBy: 'u1',
    } as never);
    const svc = new AiBuilderAuthService(prisma as never, fakeProvider as never);
    await expect(svc.approve({ proposalId: 'p1', approvedBy: 'u1' })).rejects.toThrow();
  });

  it('marks approved proposal as applied', async () => {
    const prisma = buildPrisma();
    prisma.aiBuilderProposal.findUnique.mockResolvedValueOnce({
      id: 'p1',
      status: 'approved',
      createdBy: 'u1',
    } as never);
    const svc = new AiBuilderAuthService(prisma as never, fakeProvider as never);
    const r = await svc.markApplied('p1', 'tbl_x');
    expect(r.status).toBe('applied');
  });

  it('rejects mark-applied on a draft', async () => {
    const prisma = buildPrisma();
    prisma.aiBuilderProposal.findUnique.mockResolvedValueOnce({
      id: 'p1',
      status: 'draft',
      createdBy: 'u1',
    } as never);
    const svc = new AiBuilderAuthService(prisma as never, fakeProvider as never);
    await expect(svc.markApplied('p1', 'tbl_x')).rejects.toThrow();
  });

  it('lists proposals by baseId', async () => {
    const prisma = buildPrisma();
    prisma.aiBuilderProposal.findMany.mockResolvedValueOnce([{ id: 'p1' }] as never);
    const svc = new AiBuilderAuthService(prisma as never, fakeProvider as never);
    const out = await svc.listProposals('base1');
    expect(out).toHaveLength(1);
    expect(prisma.aiBuilderProposal.findMany).toHaveBeenCalledWith({
      where: { baseId: 'base1' },
      orderBy: { createdTime: 'desc' },
    });
  });

  it('requires an explicitly configured provider', async () => {
    const prisma = buildPrisma();
    expect(() => new AiBuilderAuthService(prisma as never)).toThrow(
      'AI Builder provider is not configured'
    );
  });

  it('LLM_PROVIDER symbol is exported', () => {
    expect(typeof LLM_PROVIDER).toBe('symbol');
  });
});
