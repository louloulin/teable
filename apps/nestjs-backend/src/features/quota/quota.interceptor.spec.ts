import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';

import { QuotaExceededException } from './quota.exception';
import {
  QuotaEnforcementInterceptor,
  quotaEnforcementEnabled,
  quotaEnforcementPermissive,
  setQuotaResolver,
} from './quota.interceptor';
import { QuotaService } from './quota.service';

function ctxWith(headers: Record<string, string>, body: Record<string, unknown> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, body, user: { id: 'u1' } }),
    }),
  } as unknown as ExecutionContext;
}

describe('QuotaEnforcementInterceptor', () => {
  const originalEnabled = process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED;
  const originalPermissive = process.env.TEABLE_QUOTA_ENFORCEMENT_PERMISSIVE;

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED;
    else process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED = originalEnabled;
    if (originalPermissive === undefined) delete process.env.TEABLE_QUOTA_ENFORCEMENT_PERMISSIVE;
    else process.env.TEABLE_QUOTA_ENFORCEMENT_PERMISSIVE = originalPermissive;
    setQuotaResolver(undefined as never);
  });

  it('is a no-op when the feature flag is off', async () => {
    delete process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED;
    expect(quotaEnforcementEnabled()).toBe(false);
    const quota = { consume: jest.fn() } as unknown as QuotaService;
    const interceptor = new QuotaEnforcementInterceptor(quota);
    const handler: CallHandler = { handle: () => of('ok') };
    const result = await new Promise((resolve) => {
      interceptor.intercept(ctxWith({}), handler).subscribe({ next: resolve });
    });
    expect(result).toBe('ok');
    expect(quota.consume).not.toHaveBeenCalled();
  });

  it('calls consume before the handler runs when flag is on', async () => {
    process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED = 'true';
    const quota = { consume: jest.fn().mockResolvedValue(undefined) } as unknown as QuotaService;
    const interceptor = new QuotaEnforcementInterceptor(quota);
    const handler: CallHandler = { handle: () => of('result') };
    let consumed = false;
    await new Promise<void>((resolve) => {
      interceptor
        .intercept(
          ctxWith({ 'x-space-id': 'sp1', 'x-quota-metric': 'rows', 'x-quota-amount': '3' }),
          handler
        )
        .subscribe({
          next: () => {
            consumed = true;
            resolve();
          },
        });
    });
    expect(consumed).toBe(true);
    expect(quota.consume).toHaveBeenCalledWith(
      'sp1',
      'rows',
      3,
      expect.objectContaining({ actorId: 'u1', resource: undefined })
    );
  });

  it('throws QuotaExceededException in strict mode', async () => {
    process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED = 'true';
    delete process.env.TEABLE_QUOTA_ENFORCEMENT_PERMISSIVE;
    const quota = {
      consume: jest.fn().mockRejectedValue(new QuotaExceededException('rows', 100n, 1n, 'sp1')),
    } as unknown as QuotaService;
    const interceptor = new QuotaEnforcementInterceptor(quota);
    const handler: CallHandler = { handle: () => of('should-not-run') };
    let err: unknown;
    await new Promise<void>((resolve) => {
      interceptor
        .intercept(
          ctxWith({ 'x-space-id': 'sp1', 'x-quota-metric': 'rows', 'x-quota-amount': '5' }),
          handler
        )
        .subscribe({ error: (e) => { err = e; resolve(); } });
    });
    expect(err).toBeInstanceOf(QuotaExceededException);
  });

  it('downgrades to log+continue in permissive mode', async () => {
    process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED = 'true';
    process.env.TEABLE_QUOTA_ENFORCEMENT_PERMISSIVE = 'true';
    expect(quotaEnforcementPermissive()).toBe(true);
    const quota = {
      consume: jest.fn().mockRejectedValue(new QuotaExceededException('rows', 100n, 1n, 'sp1')),
    } as unknown as QuotaService;
    const interceptor = new QuotaEnforcementInterceptor(quota);
    const handler: CallHandler = { handle: () => of('still-runs') };
    const result = await new Promise((resolve) => {
      interceptor
        .intercept(
          ctxWith({ 'x-space-id': 'sp1', 'x-quota-metric': 'rows', 'x-quota-amount': '5' }),
          handler
        )
        .subscribe({ next: resolve });
    });
    expect(result).toBe('still-runs');
  });

  it('honors custom resolver', async () => {
    process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED = 'true';
    setQuotaResolver(() => ({ spaceId: 'sp_custom', metric: 'attachment_bytes', amount: 1024 }));
    const quota = { consume: jest.fn().mockResolvedValue(undefined) } as unknown as QuotaService;
    const interceptor = new QuotaEnforcementInterceptor(quota);
    const handler: CallHandler = { handle: () => of('ok') };
    await new Promise((resolve) => {
      interceptor.intercept(ctxWith({}), handler).subscribe({ next: resolve });
    });
    expect(quota.consume).toHaveBeenCalledWith(
      'sp_custom',
      'attachment_bytes',
      1024,
      expect.any(Object)
    );
  });
});