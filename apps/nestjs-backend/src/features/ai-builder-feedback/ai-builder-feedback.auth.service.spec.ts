/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { AiBuilderFeedbackAuthService } from './ai-builder-feedback.auth.service';

function mkPrismaMock() {
  const aiBuilderFeedbackCreate = vi.fn();
  const aiBuilderFeedbackFindMany = vi.fn();
  const prisma = {
    aiBuilderFeedback: {
      create: aiBuilderFeedbackCreate,
      findMany: aiBuilderFeedbackFindMany,
    },
  } as unknown as PrismaService;
  return {
    prisma,
    mocks: { aiBuilderFeedbackCreate, aiBuilderFeedbackFindMany },
  };
}

describe('AiBuilderFeedbackAuthService', () => {
  it('record() returns an in-memory feedback row', () => {
    const { prisma } = mkPrismaMock();
    const svc = new AiBuilderFeedbackAuthService(prisma);
    const row = svc.record({
      proposalId: 'p1',
      baseId: 'b1',
      model: 'gpt-4o',
      entityType: 'table',
      status: 'approved',
      edited: true,
      editMagnitude: 0.4,
    });
    expect(row.outcome).toBe('edited');
    expect(row.editMagnitude).toBe(0.4);
  });

  it('persist() forwards the row to Prisma', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.aiBuilderFeedbackCreate.mockResolvedValue({});
    const svc = new AiBuilderFeedbackAuthService(prisma);
    const row = svc.record({
      proposalId: 'p1',
      baseId: 'b1',
      model: 'gpt-4o',
      entityType: 'table',
      status: 'applied',
      edited: false,
    });
    await svc.persist(row);
    expect(mocks.aiBuilderFeedbackCreate).toHaveBeenCalledTimes(1);
  });

  it('loadForBase() maps Prisma rows to IProposalFeedback', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.aiBuilderFeedbackFindMany.mockResolvedValue([
      {
        proposalId: 'p1',
        baseId: 'b1',
        model: 'gpt-4o',
        entityType: 'table',
        outcome: 'accepted',
        editMagnitude: 0,
        recordedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new AiBuilderFeedbackAuthService(prisma);
    const rows = await svc.loadForBase('b1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.outcome).toBe('accepted');
  });

  it('summarize() ranks metrics when summary is requested', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.aiBuilderFeedbackFindMany.mockResolvedValue([
      {
        proposalId: 'p1',
        baseId: 'b1',
        model: 'gpt-4o',
        entityType: 'table',
        outcome: 'accepted',
        editMagnitude: 0,
        recordedAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        proposalId: 'p2',
        baseId: 'b1',
        model: 'gpt-4o',
        entityType: 'table',
        outcome: 'accepted',
        editMagnitude: 0,
        recordedAt: new Date('2026-01-02T00:00:00Z'),
      },
    ]);
    const svc = new AiBuilderFeedbackAuthService(prisma);
    const s = await svc.summarize('b1');
    expect(s.metrics).toHaveLength(1);
    expect(s.metrics[0]?.acceptanceRate).toBe(1);
  });

  it('preferredModel() returns the top-scoring trusted model', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.aiBuilderFeedbackFindMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        proposalId: `p${i}`,
        baseId: 'b1',
        model: i % 2 === 0 ? 'a' : 'b',
        entityType: 'table',
        outcome: i % 2 === 0 ? 'accepted' : 'rejected',
        editMagnitude: 0,
        recordedAt: new Date('2026-01-01T00:00:00Z'),
      }))
    );
    const svc = new AiBuilderFeedbackAuthService(prisma);
    const m = await svc.preferredModel('b1', 'table', { minSampleSize: 3 });
    expect(m).toBe('a');
  });

  it('preferredModel() returns null when no bucket is trusted', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.aiBuilderFeedbackFindMany.mockResolvedValue([]);
    const svc = new AiBuilderFeedbackAuthService(prisma);
    expect(await svc.preferredModel('b1', 'table')).toBeNull();
  });

  it('templateScores() returns one trusted score per metric', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.aiBuilderFeedbackFindMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({
        proposalId: `p${i}`,
        baseId: 'b1',
        model: 'gpt-4o',
        entityType: 'table',
        outcome: 'accepted',
        editMagnitude: 0,
        recordedAt: new Date('2026-01-01T00:00:00Z'),
      }))
    );
    const svc = new AiBuilderFeedbackAuthService(prisma);
    const scores = await svc.templateScores('b1', { minSampleSize: 5 });
    expect(scores).toHaveLength(1);
    expect(scores[0]?.templateId).toBe('gpt-4o::table');
    expect(scores[0]?.sampleSize).toBe(8);
  });
});
