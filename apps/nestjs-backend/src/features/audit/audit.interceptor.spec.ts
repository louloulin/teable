import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { IClsStore } from '../../types/cls';
import { AuditInterceptor } from './audit.interceptor';
import type { AuditLogService } from './audit-log.service';

class FakeController {
  public create(): unknown {
    return 'ok';
  }
}

function fakeHandler() {
  return FakeController.prototype.create;
}

function makeCtx(
  overrides: Partial<{
    request: Record<string, unknown>;
    response: { statusCode: number };
    controller: unknown;
    handler: unknown;
    handlerType: 'http' | 'ws' | 'rpc';
  }> = {}
): ExecutionContext {
  const request = overrides.request ?? {
    method: 'POST',
    url: '/api/test',
    body: {},
    headers: {},
  };
  const response = overrides.response ?? { statusCode: 200 };
  const handler = overrides.handler ?? fakeHandler();
  const controller = overrides.controller ?? FakeController;
  const handlerType = overrides.handlerType ?? 'http';
  return {
    getType: () => handlerType,
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function makeCls(callerId: string | null): ClsService<IClsStore> {
  return {
    get: (key: string) => (key === 'user.id' ? callerId : undefined),
  } as unknown as ClsService<IClsStore>;
}

function makeAuditLogService(): {
  service: AuditLogService;
  record: ReturnType<typeof vi.fn>;
} {
  const record = vi.fn();
  const service = { record } as unknown as AuditLogService;
  return { service, record };
}

describe('AuditInterceptor', () => {
  it('records an http_request event on the success path with method/url/controller/handler/callerId/statusCode/latencyMs', async () => {
    const { service, record } = makeAuditLogService();
    const interceptor = new AuditInterceptor(service, makeCls('usr123'));
    const ctx = makeCtx({
      request: {
        method: 'GET',
        url: '/api/foo?x=1',
        originalUrl: '/api/foo?x=1',
        body: { name: 'bar' },
        headers: { 'x-test': '1' },
      },
      response: { statusCode: 200 },
    });
    const handler: CallHandler = { handle: () => of('payload') };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(ctx, handler).subscribe({
        next: () => resolve(),
        error: (err) => reject(err),
      });
    });

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      'http_request',
      expect.objectContaining({
        method: 'GET',
        url: '/api/foo?x=1',
        controller: 'FakeController',
        handler: 'create',
        callerId: 'usr123',
        statusCode: 200,
        latencyMs: expect.any(Number),
      })
    );
    expect(interceptor.countRequestsSinceBoot()).toBe(1);
  });

  it('does not propagate auditLogService errors — the business response still flows back to the caller', async () => {
    const record = vi.fn(() => {
      throw new Error('audit_log table missing');
    });
    const service = { record } as unknown as AuditLogService;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const interceptor = new AuditInterceptor(service, makeCls(null));
      const ctx = makeCtx();
      const handler: CallHandler = { handle: () => of('business-result') };

      const result = await new Promise((resolve, reject) => {
        interceptor.intercept(ctx, handler).subscribe({
          next: (value) => resolve(value),
          error: (err) => reject(err),
        });
      });

      expect(result).toBe('business-result');
      expect(record).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith('AuditInterceptor failed:', expect.any(Error));
    } finally {
      consoleError.mockRestore();
    }
  });

  it('still emits an audit row when the controller throws UnauthorizedException (401) and rethrows the error', async () => {
    const { service, record } = makeAuditLogService();
    const interceptor = new AuditInterceptor(service, makeCls(null));
    const ctx = makeCtx({
      request: {
        method: 'GET',
        url: '/api/space/spcxxx',
        originalUrl: '/api/space/spcxxx',
        body: {},
        headers: {},
      },
      response: { statusCode: 401 },
    });
    const handler: CallHandler = {
      handle: () => throwError(() => new UnauthorizedException('no token')),
    };

    await expect(
      new Promise((resolve, reject) => {
        interceptor.intercept(ctx, handler).subscribe({
          next: (value) => resolve(value),
          error: (err) => reject(err),
        });
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      'http_request',
      expect.objectContaining({
        method: 'GET',
        url: '/api/space/spcxxx',
        callerId: null,
        statusCode: 401,
        errorName: 'UnauthorizedException',
      })
    );
  });

  it('redacts authorization/cookie headers and password/secret/token body fields to [REDACTED]', async () => {
    const { service, record } = makeAuditLogService();
    const interceptor = new AuditInterceptor(service, makeCls('usr789'));
    const ctx = makeCtx({
      request: {
        method: 'POST',
        url: '/api/auth/login',
        originalUrl: '/api/auth/login',
        body: {
          email: 'a@b.com',
          password: 'super-secret-pw',
          token: 't0p-secret-tok',
          secret: 'shh',
          nested: { token: 'inner' },
        },
        headers: {
          authorization: 'Bearer abc.def.ghi',
          cookie: 'session=abc; csrf=xyz',
          'content-type': 'application/json',
        },
      },
      response: { statusCode: 200 },
    });
    const handler: CallHandler = { handle: () => of({ ok: true }) };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(ctx, handler).subscribe({
        next: () => resolve(),
        error: (err) => reject(err),
      });
    });

    expect(record).toHaveBeenCalledTimes(1);
    const payload = record.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.redactedFields).toEqual(
      expect.arrayContaining([
        'headers.authorization',
        'headers.cookie',
        'body.password',
        'body.secret',
        'body.token',
      ])
    );
    expect(payload.body).toMatchObject({
      'headers.authorization': '[REDACTED]',
      'headers.cookie': '[REDACTED]',
      'body.password': '[REDACTED]',
      'body.secret': '[REDACTED]',
      'body.token': '[REDACTED]',
    });
    // Non-sensitive values must not appear in the redacted-body mirror.
    expect(payload.body).not.toHaveProperty('headers.content-type');
    expect(payload.body).not.toHaveProperty('body.email');
  });
});
