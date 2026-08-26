/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { BuiltinAssetsInitAuthService } from './builtin-assets-init.auth.service';
import { formatAssetId, isAssetInitComplete } from './builtin-assets-init.helpers';

interface IMockAttachmentsTable {
  count: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  attachments: IMockAttachmentsTable;
}

const buildPrisma = (): IMockPrisma => ({
  attachments: {
    count: vi.fn(async () => 0),
  },
});

describe('BuiltinAssetsInitAuthService (thin-DI wrapper)', () => {
  let prisma: IMockPrisma;
  let svc: BuiltinAssetsInitAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new BuiltinAssetsInitAuthService(prisma as never);
  });

  it('isInitialized returns initialized=false when observed < expected', async () => {
    prisma.attachments.count.mockResolvedValueOnce(2);
    const out = await svc.isInitialized();
    expect(out.initialized).toBe(false);
    expect(out.observedCount).toBe(2);
  });

  it('isInitialized returns initialized=true when observed >= expected', async () => {
    prisma.attachments.count.mockResolvedValueOnce(7);
    const out = await svc.isInitialized();
    expect(out.initialized).toBe(true);
    expect(out.observedCount).toBe(7);
  });

  it('resolveAssetId normalises the id', () => {
    expect(svc.resolveAssetId('  Foo-Bar  ')).toBe('foo-bar');
  });
});

describe('builtin-assets-init helpers', () => {
  it('formatAssetId trims + lowercases', () => {
    expect(formatAssetId('  LOGO  ')).toBe('logo');
  });

  it('isAssetInitComplete true when observed >= expected', () => {
    expect(isAssetInitComplete(5, 5)).toBe(true);
    expect(isAssetInitComplete(0, 0)).toBe(true);
    expect(isAssetInitComplete(1, 5)).toBe(false);
  });
});
