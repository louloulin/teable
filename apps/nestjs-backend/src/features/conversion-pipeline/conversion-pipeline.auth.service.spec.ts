/**
 * Conversion pipeline DSL — NestJS auth service spec (Stage 86).
 */

import { ConversionPipelineAuthService } from './conversion-pipeline.auth.service';

interface IPrismaMock {
  conversionPipeline: {
    upsert: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
  };
  fieldTypeMap: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    conversionPipeline: {
      upsert: vi.fn().mockResolvedValue(undefined),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    fieldTypeMap: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe('ConversionPipelineAuthService.savePipeline', () => {
  it('persists', async () => {
    const prisma = makePrisma();
    const svc = new ConversionPipelineAuthService(prisma as never);
    await svc.savePipeline({
      orgId: 'o1',
      pipeline: {
        id: 'p1',
        name: 'main',
        steps: [{ id: 's1', sourceField: 'a', targetField: 'b', conversion: 'cast' }],
      },
    });
    expect(prisma.conversionPipeline.upsert).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid', async () => {
    const svc = new ConversionPipelineAuthService(makePrisma() as never);
    await expect(
      svc.savePipeline({
        orgId: 'o1',
        pipeline: {
          id: 'p1',
          name: 'main',
          steps: [{ id: 's1', sourceField: 'a', targetField: 'a', conversion: 'cast' }],
        },
      })
    ).rejects.toThrow();
  });
});

describe('ConversionPipelineAuthService.loadPipeline', () => {
  it('returns null when missing', async () => {
    const svc = new ConversionPipelineAuthService(makePrisma() as never);
    expect(await svc.loadPipeline('o1', 'p1')).toBeNull();
  });
  it('parses row', async () => {
    const prisma = makePrisma();
    (prisma.conversionPipeline.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'o1:p1',
      name: 'main',
      steps: [{ id: 's1', sourceField: 'a', targetField: 'b', conversion: 'cast' }],
    });
    const svc = new ConversionPipelineAuthService(prisma as never);
    const out = await svc.loadPipeline('o1', 'p1');
    expect(out?.id).toBe('p1');
    expect(out?.steps.length).toBe(1);
  });
});

describe('ConversionPipelineAuthService.execute', () => {
  it('runs when pipeline present', async () => {
    const prisma = makePrisma();
    (prisma.conversionPipeline.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'o1:p1',
      name: 'main',
      steps: [{ id: 's1', sourceField: 'a', targetField: 'b', conversion: 'cast' }],
    });
    (prisma.fieldTypeMap.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        source: 'string',
        target: 'number',
        conversion: 'cast',
        lossless: false,
      },
    ]);
    const svc = new ConversionPipelineAuthService(prisma as never);
    const out = await svc.execute({
      orgId: 'o1',
      pipelineId: 'p1',
      records: [{ a: '7' }],
      fieldKinds: { s1: { from: 'string', to: 'number' } },
      now: '2026-01-01T00:00:00Z',
    });
    expect(out.records[0]!['b']).toBe(7);
    expect(out.run.ok).toBe(true);
  });
  it('throws when pipeline missing', async () => {
    const svc = new ConversionPipelineAuthService(makePrisma() as never);
    await expect(
      svc.execute({
        orgId: 'o1',
        pipelineId: 'missing',
        records: [],
        fieldKinds: {},
        now: '2026-01-01T00:00:00Z',
      })
    ).rejects.toThrow(/not found/);
  });
});

describe('ConversionPipelineAuthService.reorderSteps', () => {
  it('reorders when pipeline present', async () => {
    const prisma = makePrisma();
    (prisma.conversionPipeline.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'o1:p1',
      name: 'main',
      steps: [
        { id: 'a', sourceField: 'x', targetField: 'y', conversion: 'cast' },
        { id: 'b', sourceField: 'y', targetField: 'z', conversion: 'cast' },
      ],
    });
    const svc = new ConversionPipelineAuthService(prisma as never);
    const out = await svc.reorderSteps({ orgId: 'o1', pipelineId: 'p1', order: ['b', 'a'] });
    expect(out[0]!.id).toBe('b');
  });
});

describe('ConversionPipelineAuthService helpers', () => {
  it('re-exports', () => {
    const svc = new ConversionPipelineAuthService(makePrisma() as never);
    expect(typeof svc.validateStep).toBe('function');
    expect(typeof svc.validatePipeline).toBe('function');
    expect(typeof svc.appendPipeline).toBe('function');
  });
});
