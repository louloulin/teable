/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiAppBuilderRuntimeController } from './ai-app-builder-runtime.controller';

interface IMockService {
  resolveBySlug: ReturnType<typeof vi.fn>;
  getLiveRuntimeContext: ReturnType<typeof vi.fn>;
}

interface IMockResponse {
  setHeader: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  type: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

const buildResponse = (): IMockResponse => {
  const chain = {} as IMockResponse & {
    setHeader: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    type: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
  chain.setHeader = vi.fn(() => chain);
  chain.status = vi.fn(() => chain);
  chain.type = vi.fn(() => chain);
  chain.send = vi.fn(() => chain);
  return chain as IMockResponse;
};

const liveContext = (overrides: Record<string, unknown> = {}) => ({
  appId: 'app_1',
  appName: 'My Dashboard',
  versionNumber: 3,
  deployedAt: new Date('2026-09-03T10:00:00.000Z'),
  publicSlug: 'a1b2c3d4e5f6',
  snapshot: {
    schema: 1,
    app: {
      files: [
        { path: 'src/App.tsx', content: '<main><h1>Hi from {env.GREETING}</h1></main>', language: 'tsx' },
      ],
      entry: 'src/App.tsx',
      tailwind: false,
    },
  },
  secrets: { GREETING: 'Hello world' },
  ...overrides,
});

describe('AiAppBuilderRuntimeController (R57 GET /a/:slug SSR sandbox)', () => {
  let svc: IMockService;
  let controller: AiAppBuilderRuntimeController;

  beforeEach(() => {
    svc = {
      resolveBySlug: vi.fn(),
      getLiveRuntimeContext: vi.fn(),
    };
    controller = new AiAppBuilderRuntimeController(svc as never);
  });

  it('returns 404 when the slug is unknown', async () => {
    svc.resolveBySlug.mockResolvedValueOnce(null);
    const res = buildResponse();

    await expect(controller.publicRuntime('unknown', res as never)).rejects.toThrow(
      /no published app with slug=unknown/
    );
    expect(svc.getLiveRuntimeContext).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('returns 404 when the runtime context is missing', async () => {
    svc.resolveBySlug.mockResolvedValueOnce({
      id: 'app_1',
      baseId: 'bse_1',
      currentVersionId: 'apv_1',
      publicSlug: 'a1b2c3d4e5f6',
      publishedAt: new Date(),
    });
    svc.getLiveRuntimeContext.mockResolvedValueOnce(null);
    const res = buildResponse();

    await expect(controller.publicRuntime('a1b2c3d4e5f6', res as never)).rejects.toThrow(
      /no runtime context/
    );
    expect(res.send).not.toHaveBeenCalled();
  });

  it('renders SSR HTML for a published app with a deployed snapshot', async () => {
    svc.resolveBySlug.mockResolvedValueOnce({
      id: 'app_1',
      baseId: 'bse_1',
      currentVersionId: 'apv_1',
      publicSlug: 'a1b2c3d4e5f6',
      publishedAt: new Date(),
    });
    svc.getLiveRuntimeContext.mockResolvedValueOnce(liveContext());
    const res = buildResponse();

    await controller.publicRuntime('a1b2c3d4e5f6', res as never);

    expect(svc.resolveBySlug).toHaveBeenCalledWith('a1b2c3d4e5f6');
    expect(svc.getLiveRuntimeContext).toHaveBeenCalledWith('app_1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.type).toHaveBeenCalledWith('text/html; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith('x-app-renderer', 'teable-app-builder-ssr-r57');
    const sendArg = (res.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sendArg).toContain('<!doctype html>');
    expect(sendArg).toContain('Hi from Hello world');
    expect(sendArg).toContain('Live • My Dashboard');
    expect(sendArg).toContain('a1b2c3d4e5f6');
    expect(sendArg).toContain('x-teable-runtime');
  });

  it('HTML-escapes untrusted content from the snapshot', async () => {
    svc.resolveBySlug.mockResolvedValueOnce({
      id: 'app_2',
      baseId: 'bse_2',
      currentVersionId: 'apv_2',
      publicSlug: '<bad slug>',
      publishedAt: new Date(),
    });
    svc.getLiveRuntimeContext.mockResolvedValueOnce(
      liveContext({
        appName: '<script>alert("xss")</script>',
        publicSlug: '<bad slug>',
        snapshot: {
          schema: 1,
          app: {
            files: [
              { path: 'src/App.tsx', content: '<p>{env.GREETING}</p>', language: 'tsx' },
            ],
            entry: 'src/App.tsx',
            tailwind: false,
          },
        },
        secrets: { GREETING: '<img src=x onerror=alert(1)>' },
      })
    );
    const res = buildResponse();

    await controller.publicRuntime('<bad slug>', res as never);

    const sendArg = (res.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sendArg).not.toContain('<script>alert("xss")</script>');
    expect(sendArg).not.toContain('<img src=x onerror=alert(1)>');
    expect(sendArg).toContain('&lt;script&gt;');
    expect(sendArg).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('sets a content-security-policy header tailored to tailwind=false', async () => {
    svc.resolveBySlug.mockResolvedValueOnce({
      id: 'app_3',
      baseId: 'bse_3',
      currentVersionId: 'apv_3',
      publicSlug: 'a1b2c3d4e5f6',
      publishedAt: new Date(),
    });
    svc.getLiveRuntimeContext.mockResolvedValueOnce(liveContext());
    const res = buildResponse();

    await controller.publicRuntime('a1b2c3d4e5f6', res as never);

    expect(res.setHeader).toHaveBeenCalledWith('content-security-policy', expect.stringContaining('script-src'));
  });

  it('returns 422 when the SSR sandbox rejects the snapshot', async () => {
    svc.resolveBySlug.mockResolvedValueOnce({
      id: 'app_4',
      baseId: 'bse_4',
      currentVersionId: 'apv_4',
      publicSlug: 'a1b2c3d4e5f6',
      publishedAt: new Date(),
    });
    // eval is a forbidden token — sandbox rejects on parse
    svc.getLiveRuntimeContext.mockResolvedValueOnce(
      liveContext({
        snapshot: {
          schema: 1,
          app: {
            files: [{ path: 'src/App.tsx', content: '<div>eval</div>', language: 'tsx' }],
            entry: 'src/App.tsx',
            tailwind: false,
          },
        },
      })
    );
    const res = buildResponse();

    await controller.publicRuntime('a1b2c3d4e5f6', res as never);

    expect(res.status).toHaveBeenCalledWith(422);
    const sendArg = (res.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sendArg).toContain('forbidden identifier');
    expect(sendArg).toContain('Render error');
  });
});
