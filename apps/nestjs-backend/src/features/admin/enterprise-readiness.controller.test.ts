import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

import { EnterpriseReadinessController } from './enterprise-readiness.controller';
import { EnterpriseReadinessService } from './enterprise-readiness.service';

describe('EnterpriseReadinessController', () => {
  const originalToken = process.env.TEABLE_ADMIN_TOKEN;
  let mockReport: ReturnType<typeof vi.fn>;
  let controller: EnterpriseReadinessController;

  const buildModule = async () => {
    mockReport = vi.fn().mockResolvedValue({
      instance: { uptimeSec: 1, generatedAt: '2026-08-31T00:00:00Z' },
      plan: { level: 'self_hosted', label: 'Self-hosted', licenseSource: 'none' },
      capabilities: {
        sso: { enabled: true, module: 'sso' },
        audit_log: { enabled: true, module: 'audit' },
        permission_matrix: { enabled: true, module: 'permission-matrix' },
      },
      quotas: {
        rows: { current: 0, limit: null },
        attachments: { currentBytes: 0, limitBytes: null },
        automationRuns: { thisMonth: 0, limitPerMonth: null },
        seats: { current: 0, limit: null },
      },
      integrations: {
        samlProviders: 0,
        ssoOidcProviders: 0,
        organizationDomains: 0,
        emailDomainsClaimed: 0,
      },
      summary: { total: 3, enabled: 3, disabled: 0, missing: 0, cloudBusinessParity: '3/3' },
    });
    const module = await Test.createTestingModule({
      controllers: [EnterpriseReadinessController],
      providers: [{ provide: EnterpriseReadinessService, useValue: { report: mockReport } }],
    }).compile();
    controller = module.get(EnterpriseReadinessController);
  };

  beforeEach(async () => {
    process.env.TEABLE_ADMIN_TOKEN = 'test-token';
    await buildModule();
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.TEABLE_ADMIN_TOKEN;
    } else {
      process.env.TEABLE_ADMIN_TOKEN = originalToken;
    }
  });

  it('returns 200 with the readiness report when the admin token matches', async () => {
    const result = await controller.get('test-token');
    expect(result.summary.cloudBusinessParity).toBe('3/3');
    expect(result.plan.level).toBe('self_hosted');
    expect(mockReport).toHaveBeenCalledTimes(1);
  });

  it('rejects requests without an admin token', async () => {
    await expect(controller.get(undefined)).rejects.toThrow(UnauthorizedException);
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('rejects requests with a mismatched admin token', async () => {
    await expect(controller.get('wrong')).rejects.toThrow(UnauthorizedException);
    expect(mockReport).not.toHaveBeenCalled();
  });
});
