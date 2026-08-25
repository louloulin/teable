/**
 * Field type mapping matrix — NestJS auth service spec (Stage 85).
 */

import { FieldTypeMapAuthService } from './field-type-map.auth.service';

interface IPrismaMock {
  fieldTypeMap: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    upsert: (args: unknown) => Promise<unknown>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    fieldTypeMap: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('FieldTypeMapAuthService.listForOrg', () => {
  it('returns default matrix when no customs', async () => {
    const svc = new FieldTypeMapAuthService(makePrisma() as never);
    const out = await svc.listForOrg('o1');
    expect(out.length).toBeGreaterThanOrEqual(100);
  });
});

describe('FieldTypeMapAuthService.upsert', () => {
  it('persists', async () => {
    const prisma = makePrisma();
    const svc = new FieldTypeMapAuthService(prisma as never);
    await svc.upsert({
      orgId: 'o1',
      source: 'string',
      target: 'number',
      conversion: 'cast',
      lossless: false,
      notes: 'ok',
    });
    expect(prisma.fieldTypeMap.upsert).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid', async () => {
    const svc = new FieldTypeMapAuthService(makePrisma() as never);
    await expect(
      svc.upsert({
        orgId: 'o1',
        source: 'string',
        target: 'string',
        conversion: 'cast',
        lossless: false,
      })
    ).rejects.toThrow(/identity/);
  });
});

describe('FieldTypeMapAuthService.coerceBatch', () => {
  it('coerces', async () => {
    const svc = new FieldTypeMapAuthService(makePrisma() as never);
    const out = await svc.coerceBatch({
      orgId: 'o1',
      from: 'string',
      to: 'string',
      values: ['a', 'b', 'c'],
    });
    expect(out.ok.every(Boolean)).toBe(true);
    expect(out.values).toEqual(['a', 'b', 'c']);
  });
});

describe('FieldTypeMapAuthService.pathIsLossy', () => {
  it('identity lossless', async () => {
    const svc = new FieldTypeMapAuthService(makePrisma() as never);
    expect(await svc.pathIsLossy({ orgId: 'o1', from: 'string', to: 'string' })).toBe(false);
  });
  it('reject lossy', async () => {
    const svc = new FieldTypeMapAuthService(makePrisma() as never);
    expect(await svc.pathIsLossy({ orgId: 'o1', from: 'string', to: 'number' })).toBe(true);
  });
});

describe('FieldTypeMapAuthService helpers', () => {
  it('re-exports', () => {
    const svc = new FieldTypeMapAuthService(makePrisma() as never);
    expect(typeof svc.lookupMap).toBe('function');
    expect(typeof svc.defaultMatrix).toBe('function');
    expect(typeof svc.setMap).toBe('function');
    expect(typeof svc.validateMap).toBe('function');
  });
});
