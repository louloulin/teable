import { Test, type TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { HttpErrorCode } from '@teable/core';
import { CustomHttpException } from '../../custom.exception';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { LicenseCapabilityService } from '../license/license-capability.service';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService, type IAuditLogPage } from './audit-log.service';

/**
 * Build a tiny harness around the controller + service pair so each test
 * can configure either a permissive or a restrictive capability gate
 * without re-wiring the module from scratch.
 *
 * `query` is the mock `AuditLogService.query` invocation; `require` is the
 * mock `LicenseCapabilityService.require` (used to assert the guard
 * fires when capability is off).
 */
const buildHarness = async (opts: {
  capsEnabled: boolean;
  serviceResponse?: IAuditLogPage;
}) => {
  const query = vi.fn().mockResolvedValue(
    opts.serviceResponse ?? {
      rows: [],
      total: 0,
    } satisfies IAuditLogPage
  );
  const isEnabled = vi.fn().mockReturnValue(opts.capsEnabled);
  const require = vi.fn().mockImplementation(() => {
    if (!opts.capsEnabled) {
      throw new CustomHttpException(
        'capability "audit_log" requires a license upgrade',
        HttpErrorCode.PAYMENT_REQUIRED,
        { cause: 'LICENSE_REQUIRED' }
      );
    }
  });

  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [AuditLogController],
    providers: [
      { provide: AuditLogService, useValue: { query } },
      {
        provide: LicenseCapabilityService,
        useValue: { isEnabled, require },
      },
    ],
  }).compile();

  const controller = moduleRef.get(AuditLogController);
  return { controller, query, isEnabled, require, moduleRef };
};

describe('AuditLogController', () => {
  it('returns an empty page when no audit rows exist', async () => {
    const { controller, query } = await buildHarness({
      capsEnabled: true,
      serviceResponse: { rows: [], total: 0 },
    });

    await expect(controller.query()).resolves.toEqual({ rows: [], total: 0 });

    expect(query).toHaveBeenCalledTimes(1);
    // defaults: page=1, pageSize=20, no filter fields
    const filter = query.mock.calls[0][0];
    expect(filter.page).toBe(1);
    expect(filter.pageSize).toBe(20);
    expect(filter.actor).toBeUndefined();
    expect(filter.action).toBeUndefined();
    expect(filter.resourceType).toBeUndefined();
    expect(filter.since).toBeUndefined();
    expect(filter.until).toBeUndefined();
  });

  it('forwards single-filter query string fields to the service', async () => {
    const { controller, query } = await buildHarness({
      capsEnabled: true,
      serviceResponse: {
        rows: [
          {
            id: 'row1',
            userId: 'u1',
            action: 'user.sso.login.success',
            resourceType: 'user',
            resourceId: 'u1',
            payload: { reason: null },
            rootAction: null,
            operationId: null,
            createdAt: new Date('2026-08-25T10:00:00.000Z'),
          },
        ],
        total: 1,
      },
    });

    await expect(
      controller.query(undefined, 'user.sso.login.success', 'user')
    ).resolves.toEqual({
      rows: [
        {
          id: 'row1',
          userId: 'u1',
          action: 'user.sso.login.success',
          resourceType: 'user',
          resourceId: 'u1',
          payload: { reason: null },
          rootAction: null,
          operationId: null,
          createdAt: new Date('2026-08-25T10:00:00.000Z'),
        },
      ],
      total: 1,
    });

    expect(query).toHaveBeenCalledTimes(1);
    const filter = query.mock.calls[0][0];
    expect(filter.action).toBe('user.sso.login.success');
    expect(filter.resourceType).toBe('user');
    expect(filter.actor).toBeUndefined();
  });

  it('parses page/pageSize and ISO8601 since/until into the service filter', async () => {
    const { controller, query } = await buildHarness({ capsEnabled: true });

    await controller.query(
      'u1',
      undefined,
      undefined,
      '2026-08-01T00:00:00.000Z',
      '2026-08-25T23:59:59.000Z',
      '2',
      '50'
    );

    expect(query).toHaveBeenCalledTimes(1);
    const filter = query.mock.calls[0][0];
    expect(filter.actor).toBe('u1');
    expect(filter.page).toBe(2);
    expect(filter.pageSize).toBe(50);
    expect(filter.since).toBeInstanceOf(Date);
    expect((filter.since as Date).toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(filter.until).toBeInstanceOf(Date);
    expect((filter.until as Date).toISOString()).toBe('2026-08-25T23:59:59.000Z');
  });

  it('clamps pageSize above 100 to 100 and rejects negative page / pageSize', async () => {
    const { controller, query } = await buildHarness({ capsEnabled: true });

    await controller.query(undefined, undefined, undefined, undefined, undefined, '1', '500');
    expect(query.mock.calls[0][0].pageSize).toBe(100);

    await expect(
      controller.query(undefined, undefined, undefined, undefined, undefined, '0', '20')
    ).rejects.toThrow(/page must be a positive integer/);

    await expect(
      controller.query(undefined, undefined, undefined, undefined, undefined, '1', '-5')
    ).rejects.toThrow(/pageSize must be a positive integer/);
  });

  it('rejects malformed since/until with BadRequestException', async () => {
    const { controller } = await buildHarness({ capsEnabled: true });

    await expect(
      controller.query(undefined, undefined, undefined, 'not-a-date')
    ).rejects.toThrow(/since must be a valid ISO8601 timestamp/);

    await expect(
      controller.query(undefined, undefined, undefined, undefined, 'also-bad')
    ).rejects.toThrow(/until must be a valid ISO8601 timestamp/);
  });

  it('blocks the request with 402 LICENSE_REQUIRED when the audit_log capability guard rejects it', async () => {
    const { isEnabled, require } = await buildHarness({ capsEnabled: false });

    // The guard itself is wired at the controller level — invoke it
    // directly to verify it consults the capability service with
    // `audit_log` and throws when off. NestJS would call this on every
    // request, before the handler runs.
    const guardRef = LicenseCapabilityGuard.for('audit_log');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const guard = new (guardRef as any)({
      isEnabled,
      require,
    } as LicenseCapabilityService);
    expect(() => guard.canActivate({} as never)).toThrow(CustomHttpException);
    expect(() => guard.canActivate({} as never)).toThrow(/capability "audit_log"/);

    expect(isEnabled).toHaveBeenCalledWith('audit_log');
    expect(require).toHaveBeenCalledWith('audit_log');
  });
});