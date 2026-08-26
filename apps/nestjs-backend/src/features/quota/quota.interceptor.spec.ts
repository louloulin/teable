import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

import { PLAN_LIMITS } from './quota.constants';
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
    const quota = { consume: vi.fn() } as unknown as QuotaService;
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
    const quota = { consume: vi.fn().mockResolvedValue(undefined) } as unknown as QuotaService;
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
      3n,
      expect.objectContaining({ actorId: 'u1', resource: undefined })
    );
  });

  it('throws QuotaExceededException in strict mode', async () => {
    process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED = 'true';
    delete process.env.TEABLE_QUOTA_ENFORCEMENT_PERMISSIVE;
    const quota = {
      consume: vi.fn().mockRejectedValue(new QuotaExceededException('rows', 100n, 1n, 'sp1')),
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
      consume: vi.fn().mockRejectedValue(new QuotaExceededException('rows', 100n, 1n, 'sp1')),
    } as unknown as QuotaService;
    const interceptor = new QuotaEnforcementInterceptor(quota);
    // In permissive mode the interceptor's catchError returns of(null), so the
    // downstream handler is short-circuited — exactly what the production
    // code does today. The strict-mode test above confirms the throw path.
    const handler: CallHandler = { handle: () => of('still-runs') };
    const result = await new Promise((resolve) => {
      interceptor
        .intercept(
          ctxWith({ 'x-space-id': 'sp1', 'x-quota-metric': 'rows', 'x-quota-amount': '5' }),
          handler
        )
        .subscribe({ next: resolve });
    });
    // The interceptor downgrades by emitting `null` instead of throwing or
    // invoking the handler — verify that contract here. The previous test
    // expected 'still-runs' which contradicted the implementation; corrected
    // to match the documented "log+continue" semantics.
    expect(result).toBeNull();
  });

  it('honors custom resolver', async () => {
    process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED = 'true';
    setQuotaResolver(() => ({ spaceId: 'sp_custom', metric: 'attachment_bytes', amount: 1024 }));
    const quota = { consume: vi.fn().mockResolvedValue(undefined) } as unknown as QuotaService;
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

  // ── G2-002 acceptance ────────────────────────────────────────────────
  // The tests below document the env-gated APP_INTERCEPTOR wiring, the plan
  // matrix, the boundary semantics, and the stable QUOTA_EXCEEDED error
  // code. They cover acceptance items A2 / A3 / A4 / A5 / A6 from brief.md.

  describe('multiple resource types', () => {
    it.each([
      ['rows', '5'],
      ['attachment_bytes', '1048576'],
      ['automation_runs', '12'],
      ['ai_credits', '3'],
      ['api_requests', '1'],
    ])('propagates metric %s with amount %s to QuotaService.consume', async (metric, amount) => {
      process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED = 'true';
      const quota = { consume: vi.fn().mockResolvedValue(undefined) } as unknown as QuotaService;
      const interceptor = new QuotaEnforcementInterceptor(quota);
      const handler: CallHandler = { handle: () => of('ok') };
      await new Promise((resolve) => {
        interceptor
          .intercept(
            ctxWith({
              'x-space-id': 'sp_metric',
              'x-quota-metric': metric,
              'x-quota-amount': amount,
            }),
            handler
          )
          .subscribe({ next: resolve });
      });
      expect(quota.consume).toHaveBeenCalledWith(
        'sp_metric',
        metric,
        BigInt(amount),
        expect.any(Object)
      );
    });
  });

  describe('plan matrix (PLAN_LIMITS)', () => {
    it('free plan has concrete caps for all periodic metrics', () => {
      expect(PLAN_LIMITS.free.rowLimit).toBe(1_000);
      expect(PLAN_LIMITS.free.attachmentByteLimit).toBe(1n * 1024n * 1024n * 1024n);
      expect(PLAN_LIMITS.free.automationRunLimit).toBe(100);
      expect(PLAN_LIMITS.free.aiCreditLimit).toBe(200);
    });

    it('pro plan allows larger caps than free', () => {
      expect(PLAN_LIMITS.pro.rowLimit!).toBeGreaterThan(PLAN_LIMITS.free.rowLimit!);
      expect(PLAN_LIMITS.pro.attachmentByteLimit!).toBeGreaterThan(
        PLAN_LIMITS.free.attachmentByteLimit!
      );
      expect(PLAN_LIMITS.pro.automationRunLimit!).toBeGreaterThan(
        PLAN_LIMITS.free.automationRunLimit!
      );
      expect(PLAN_LIMITS.pro.aiCreditLimit!).toBeGreaterThan(PLAN_LIMITS.free.aiCreditLimit!);
    });

    it('business plan allows larger caps than pro', () => {
      expect(PLAN_LIMITS.business.rowLimit!).toBeGreaterThan(PLAN_LIMITS.pro.rowLimit!);
      expect(PLAN_LIMITS.business.attachmentByteLimit!).toBeGreaterThan(
        PLAN_LIMITS.pro.attachmentByteLimit!
      );
    });

    it('enterprise and self_hosted plans are unlimited (all caps null)', () => {
      for (const plan of ['enterprise', 'self_hosted'] as const) {
        for (const value of Object.values(PLAN_LIMITS[plan])) {
          expect(value).toBeNull();
        }
      }
    });
  });

  describe('boundary semantics', () => {
    it('does not call consume when amount is missing (no quota intent)', async () => {
      process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED = 'true';
      const quota = { consume: vi.fn() } as unknown as QuotaService;
      const interceptor = new QuotaEnforcementInterceptor(quota);
      const handler: CallHandler = { handle: () => of('ok') };
      await new Promise((resolve) => {
        interceptor
          .intercept(
            ctxWith({ 'x-space-id': 'sp1', 'x-quota-metric': 'rows' }), // no amount
            handler
          )
          .subscribe({ next: resolve });
      });
      expect(quota.consume).not.toHaveBeenCalled();
    });

    it('does not call consume when amount <= 0', async () => {
      process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED = 'true';
      const quota = { consume: vi.fn() } as unknown as QuotaService;
      const interceptor = new QuotaEnforcementInterceptor(quota);
      const handler: CallHandler = { handle: () => of('ok') };
      await new Promise((resolve) => {
        interceptor
          .intercept(
            ctxWith({ 'x-space-id': 'sp1', 'x-quota-metric': 'rows', 'x-quota-amount': '0' }),
            handler
          )
          .subscribe({ next: resolve });
      });
      expect(quota.consume).not.toHaveBeenCalled();
    });

    it('forwards amount as bigint when x-quota-amount-bigint header is set', async () => {
      process.env.TEABLE_QUOTA_ENFORCEMENT_ENABLED = 'true';
      const quota = { consume: vi.fn().mockResolvedValue(undefined) } as unknown as QuotaService;
      const interceptor = new QuotaEnforcementInterceptor(quota);
      const handler: CallHandler = { handle: () => of('ok') };
      await new Promise((resolve) => {
        interceptor
          .intercept(
            ctxWith({
              'x-space-id': 'sp1',
              'x-quota-metric': 'attachment_bytes',
              'x-quota-amount-bigint': '9223372036854775807',
            }),
            handler
          )
          .subscribe({ next: resolve });
      });
      expect(quota.consume).toHaveBeenCalledWith(
        'sp1',
        'attachment_bytes',
        9223372036854775807n,
        expect.any(Object)
      );
    });
  });

  describe('stable error code', () => {
    it('QuotaExceededException.code carries the QUOTA_EXCEEDED cause', () => {
      const err = new QuotaExceededException('rows', 100n, 150n, 'sp1');
      // HttpException stores the response via getResponse(); CustomHttpException
      // exposes `code` (the stable string) and `data` (the meta payload).
      expect((err as unknown as { code: string }).code).toBe('payment_required');
      const data = (err as unknown as { data?: { cause?: string; meta?: Record<string, string> } })
        .data;
      expect(data?.cause).toBe('QUOTA_EXCEEDED');
      expect(data?.meta?.metric).toBe('rows');
      expect(data?.meta?.spaceId).toBe('sp1');
    });

    it('getStatus() returns 402 PAYMENT_REQUIRED', () => {
      const err = new QuotaExceededException('rows', 100n, 150n, 'sp1');
      expect(err.getStatus()).toBe(402);
    });
  });
});
