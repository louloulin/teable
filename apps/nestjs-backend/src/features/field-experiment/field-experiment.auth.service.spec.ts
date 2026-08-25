/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { FieldExperimentAuthService } from './field-experiment.auth.service';
import type { IFieldExperiment } from './field-experiment.types';

function mkPrismaMock() {
  const fieldExperimentFindUnique = vi.fn();
  const fieldExperimentFindFirst = vi.fn();
  const fieldExperimentUpsert = vi.fn();
  const fieldExperimentAssignmentUpsert = vi.fn();
  const fieldExperimentExposureCreate = vi.fn();
  const fieldExperimentExposureFindMany = vi.fn();
  const prisma = {
    fieldExperiment: {
      findUnique: fieldExperimentFindUnique,
      findFirst: fieldExperimentFindFirst,
      upsert: fieldExperimentUpsert,
    },
    fieldExperimentAssignment: {
      upsert: fieldExperimentAssignmentUpsert,
    },
    fieldExperimentExposure: {
      create: fieldExperimentExposureCreate,
      findMany: fieldExperimentExposureFindMany,
    },
  } as unknown as PrismaService;
  return {
    prisma,
    mocks: {
      fieldExperimentFindUnique,
      fieldExperimentFindFirst,
      fieldExperimentUpsert,
      fieldExperimentAssignmentUpsert,
      fieldExperimentExposureCreate,
      fieldExperimentExposureFindMany,
    },
  };
}

const exp: IFieldExperiment = {
  id: 'exp1',
  baseId: 'b1',
  tableId: 't1',
  fieldId: 'f1',
  key: 'sum-prompt',
  status: 'running',
  variants: [
    { id: 'v1', label: 'control', kind: 'control', weight: 50 },
    { id: 'v2', label: 'treatment', kind: 'treatment', weight: 50 },
  ],
  salt: 's1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('FieldExperimentAuthService', () => {
  it('validate() delegates to pure helpers', () => {
    const { prisma } = mkPrismaMock();
    const svc = new FieldExperimentAuthService(prisma);
    expect(svc.validate(exp)).toEqual([]);
  });

  it('loadExperiment() returns null when missing', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.fieldExperimentFindUnique.mockResolvedValue(null);
    const svc = new FieldExperimentAuthService(prisma);
    expect(await svc.loadExperiment('missing')).toBeNull();
  });

  it('loadExperiment() maps a row to domain', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.fieldExperimentFindUnique.mockResolvedValue({
      id: 'exp1',
      baseId: 'b1',
      tableId: 't1',
      fieldId: 'f1',
      key: 'sum-prompt',
      status: 'running',
      variants: exp.variants,
      salt: 's1',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      endedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const svc = new FieldExperimentAuthService(prisma);
    const out = await svc.loadExperiment('exp1');
    expect(out?.id).toBe('exp1');
    expect(out?.variants.length).toBe(2);
  });

  it('persistExperiment() forwards to Prisma upsert', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.fieldExperimentUpsert.mockResolvedValue({});
    const svc = new FieldExperimentAuthService(prisma);
    await svc.persistExperiment(exp);
    expect(mocks.fieldExperimentUpsert).toHaveBeenCalledTimes(1);
  });

  it('persistAssignment() forwards to Prisma upsert', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.fieldExperimentAssignmentUpsert.mockResolvedValue({});
    const svc = new FieldExperimentAuthService(prisma);
    await svc.persistAssignment({
      experimentId: 'exp1',
      recordId: 'r1',
      variantId: 'v1',
      bucket: 0.3,
      assignedAt: '2026-01-01T00:00:00Z',
    });
    expect(mocks.fieldExperimentAssignmentUpsert).toHaveBeenCalledTimes(1);
  });

  it('persistExposure() forwards to Prisma create', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.fieldExperimentExposureCreate.mockResolvedValue({});
    const svc = new FieldExperimentAuthService(prisma);
    await svc.persistExposure({
      experimentId: 'exp1',
      assignmentId: 'exp1:r1',
      recordId: 'r1',
      variantId: 'v1',
      observedAt: '2026-01-01T00:00:00Z',
    });
    expect(mocks.fieldExperimentExposureCreate).toHaveBeenCalledTimes(1);
  });

  it('applyExperiment() returns base value when no active experiment', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.fieldExperimentFindFirst.mockResolvedValue(null);
    const svc = new FieldExperimentAuthService(prisma);
    const out = await svc.applyExperiment({
      baseId: 'b1',
      tableId: 't1',
      fieldId: 'f1',
      recordId: 'r1',
      baseValue: 'orig',
    });
    expect(out.value).toBe('orig');
    expect(out.exposure).toBeNull();
  });

  it('applyExperiment() returns annotated value when treatment is picked', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.fieldExperimentFindFirst.mockResolvedValue({
      id: 'exp1',
      baseId: 'b1',
      tableId: 't1',
      fieldId: 'f1',
      key: 'sum-prompt',
      status: 'running',
      variants: [
        { id: 'v1', label: 'control', kind: 'control', weight: 0 },
        {
          id: 'v2',
          label: 'treatment',
          kind: 'treatment',
          weight: 100,
          payload: { prompt: 'alt' },
        },
      ],
      salt: 's1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const svc = new FieldExperimentAuthService(prisma);
    const out = await svc.applyExperiment({
      baseId: 'b1',
      tableId: 't1',
      fieldId: 'f1',
      recordId: 'r1',
      baseValue: 'orig',
    });
    expect(out.exposure).not.toBeNull();
    expect(typeof out.value).toBe('object');
  });

  it('assign() returns and persists an assignment', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.fieldExperimentAssignmentUpsert.mockResolvedValue({});
    const svc = new FieldExperimentAuthService(prisma);
    const a = await svc.assign({ experiment: exp, recordId: 'r1' });
    expect(a).not.toBeNull();
    expect(mocks.fieldExperimentAssignmentUpsert).toHaveBeenCalled();
  });

  it('summarize() returns null when experiment is missing', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.fieldExperimentFindUnique.mockResolvedValue(null);
    const svc = new FieldExperimentAuthService(prisma);
    expect(await svc.summarize('missing')).toBeNull();
  });

  it('summarize() aggregates exposures', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.fieldExperimentFindUnique.mockResolvedValue({
      ...exp,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      startedAt: null,
      endedAt: null,
    });
    mocks.fieldExperimentExposureFindMany.mockResolvedValue([
      {
        experimentId: 'exp1',
        assignmentId: 'exp1:r1',
        recordId: 'r1',
        variantId: 'v2',
        outcome: 'convert',
        value: 1.5,
        observedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new FieldExperimentAuthService(prisma);
    const s = await svc.summarize('exp1');
    expect(s).not.toBeNull();
    expect(s?.variants.length).toBe(2);
  });

  it('pickVariant() delegates to pure helpers', () => {
    const { prisma } = mkPrismaMock();
    const svc = new FieldExperimentAuthService(prisma);
    const a = svc.pickVariant(exp, 'r1');
    expect(a).not.toBeNull();
  });

  it('variantFor() returns the matching variant', () => {
    const { prisma } = mkPrismaMock();
    const svc = new FieldExperimentAuthService(prisma);
    expect(svc.variantFor(exp, 'v2')?.label).toBe('treatment');
  });

  it('completeIfWinner() returns false when no winner', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.fieldExperimentFindUnique.mockResolvedValue({
      ...exp,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      startedAt: null,
      endedAt: null,
    });
    mocks.fieldExperimentExposureFindMany.mockResolvedValue([]);
    const svc = new FieldExperimentAuthService(prisma);
    expect(await svc.completeIfWinner('exp1')).toBe(false);
  });
});
