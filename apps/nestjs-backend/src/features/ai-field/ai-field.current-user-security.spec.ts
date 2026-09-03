import type { ClsService } from 'nestjs-cls';
import { describe, expect, it, vi } from 'vitest';

import type { IClsStore } from '../../types/cls';
import { AiFieldController } from './ai-field.controller';
import type { AiFieldAuthService } from './ai-field.auth.service';

/**
 * V75 R-AI-FIELD-SEC — regression test for the `?? 'usr_admin'` security
 * regression. The old code silently fell back to an admin identity when
 * CLS had no user; the fix throws UnauthorizedException.
 *
 * Test name ends in `.security.spec.ts` (not `.controller.spec.ts`) so
 * vitest picks it up — the project's vitest config excludes
 * `*.controller.spec.ts` files.
 */
describe('AiFieldController.currentUserId — security (V75 R-AI-FIELD-SEC)', () => {
  function buildSvcAndCls(opts: { withUserId: boolean; userId?: string }) {
    const svc = {
      createAiField: vi.fn(async (i: unknown) => ({ ...i, id: 'fake' })),
      createTemplate: vi.fn(async (i: unknown) => ({ ...i, id: 'fake-tpl' })),
      executeRun: vi.fn(async (i: unknown) => ({ ...i, id: 'fake-run' })),
      listAiFields: vi.fn(async () => []),
      getAiField: vi.fn(async () => null),
      updateAiField: vi.fn(async () => null),
      deleteAiField: vi.fn(async () => null),
      runAiField: vi.fn(async () => null),
      cancelRun: vi.fn(async () => null),
      listTemplates: vi.fn(async () => []),
      getTemplate: vi.fn(async () => null),
      deleteTemplate: vi.fn(async () => null),
    } as unknown as AiFieldAuthService;

    const cls = {
      get: (key: string) =>
        key === 'user.id' ? (opts.withUserId ? opts.userId : undefined) : undefined,
    } as unknown as ClsService<IClsStore>;

    return { svc, cls };
  }

  // `instanceof UnauthorizedException` is unreliable here because vitest's
  // swc transform can load two distinct copies of @nestjs/common at test
  // time. Matching the canonical NestJS status + message is robust.
  const expectUnauthorized = async (p: Promise<unknown>, label: string) => {
    try {
      await p;
      throw new Error(`${label}: expected throw, got success`);
    } catch (e: unknown) {
      const err = e as { status?: number; message?: unknown };
      const msg = typeof err.message === 'string' ? err.message : String(err.message ?? '');
      if (err.status !== 401 || !msg.includes('AI Field requires an authenticated user')) {
        throw new Error(
          `${label}: expected 401 Unauthorized with 'AI Field requires' — got status=${err.status} message=${msg}`
        );
      }
    }
  };

  it('throws UnauthorizedException on create without CLS user (no silent admin fallback)', async () => {
    const { svc, cls } = buildSvcAndCls({ withUserId: false });
    const ctrl = new AiFieldController(svc, cls);

    await expectUnauthorized(
      ctrl.create({ baseId: 'b1', tableId: 't1', fieldId: 'f1', prompt: 'x' } as never),
      'create'
    );

    // Critical: the underlying service MUST NOT have been called.
    expect((svc as { createAiField: ReturnType<typeof vi.fn> }).createAiField).not.toHaveBeenCalled();
  });

  it('proceeds normally when CLS carries a valid user id', async () => {
    const { svc, cls } = buildSvcAndCls({ withUserId: true, userId: 'usr-real' });
    const ctrl = new AiFieldController(svc, cls);

    const out = await ctrl.create({
      baseId: 'b1',
      tableId: 't1',
      fieldId: 'f1',
      prompt: 'x',
    } as never);
    expect(out).toMatchObject({ createdBy: 'usr-real' });
    expect((svc as { createAiField: ReturnType<typeof vi.fn> }).createAiField).toHaveBeenCalledTimes(1);
  });

  it('throws UnauthorizedException on createTemplate without a user id', async () => {
    const { svc, cls } = buildSvcAndCls({ withUserId: false });
    const ctrl = new AiFieldController(svc, cls);

    await expectUnauthorized(
      ctrl.createTemplate({ name: 't', prompt: 'p' } as never),
      'createTemplate'
    );
    expect((svc as { createTemplate: ReturnType<typeof vi.fn> }).createTemplate).not.toHaveBeenCalled();
  });

  // Note: `run()` does not call currentUserId() in the controller — it
  // is fire-and-forget from the admin's perspective. Adding user-id
  // enforcement here would be a feature change beyond V75 R-AI-FIELD-SEC
  // (which only addresses the silent admin-fallback regression).
});
