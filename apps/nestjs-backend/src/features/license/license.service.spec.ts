import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@teable/db-main-prisma';

import { QuotaService } from '../quota/quota.service';
import { LicenseService } from './license.service';

describe('LicenseService', () => {
  let service: LicenseService;
  let quota: { setPlanLimits: jest.Mock };

  beforeEach(async () => {
    quota = { setPlanLimits: jest.fn().mockResolvedValue({}) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicenseService,
        { provide: PrismaService, useValue: {} },
        { provide: QuotaService, useValue: quota },
      ],
    }).compile();
    service = module.get(LicenseService);
  });

  it('returns empty when no key is set', () => {
    const r = service.resolve(undefined);
    expect(r.source).toBe('none');
  });

  it('parses env format plan:business', () => {
    const r = service.resolve('plan:business:seats=10');
    expect(r.source).toBe('env');
    expect(r.claims?.plan).toBe('business');
    expect(r.claims?.seats).toBe(10);
  });

  it('parses env format plan:pro', () => {
    const r = service.resolve('plan:pro');
    expect(r.source).toBe('env');
    expect(r.claims?.plan).toBe('pro');
  });

  it('rejects unknown plans', () => {
    const r = service.resolve('plan:enterprise-plus');
    expect(r.source).toBe('none');
  });

  it('ignores non-JWT non-env tokens', () => {
    const r = service.resolve('something-random');
    expect(r.source).toBe('none');
  });
});