/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiAppBuilderRuntimeController } from './ai-app-builder-runtime.controller';

interface IMockService {
  resolveBySlug: ReturnType<typeof vi.fn>;
  getSnapshotByAppId: ReturnType<typeof vi.fn>;
}

interface IMockResponse {
  status: ReturnType<typeof vi.fn>;
  type: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

const buildResponse = (): IMockResponse => {
  const chain = {} as IMockResponse & {
    status: ReturnType<typeof vi.fn>;
    type: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
  chain.status = vi.fn(() => chain);
  chain.type = vi.fn(() => chain);
  chain.send = vi.fn(() => chain);
  return chain as IMockResponse;
};

describe('AiAppBuilderRuntimeController (Round 46 GET /a/:slug)', () => {
  let svc: IMockService;
  let controller: AiAppBuilderRuntimeController;

  beforeEach(() => {
    svc = {
      resolveBySlug: vi.fn(),
      getSnapshotByAppId: vi.fn(),
    };
    controller = new AiAppBuilderRuntimeController(svc as never);
  });

  it('returns 404 when the slug is unknown', async () => {
    svc.resolveBySlug.mockResolvedValueOnce(null);
    const res = buildResponse();

    await expect(controller.runtime('unknown', res as never)).rejects.toThrow(
      /no published app with slug=unknown/
    );
    expect(svc.getSnapshotByAppId).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('returns 404 when the published app has no deployable snapshot', async () => {
    svc.resolveBySlug.mockResolvedValueOnce({
      id: 'app_1',
      baseId: 'bse_1',
      currentVersionId: 'apv_1',
      publicSlug: 'a1b2c3d4e5f6',
      publishedAt: new Date(),
    });
    svc.getSnapshotByAppId.mockResolvedValueOnce(null);
    const res = buildResponse();

    await expect(controller.runtime('a1b2c3d4e5f6', res as never)).rejects.toThrow(
      /no deployable snapshot/
    );
    expect(res.send).not.toHaveBeenCalled();
  });

  it('renders HTML for a published app with a deployed snapshot', async () => {
    svc.resolveBySlug.mockResolvedValueOnce({
      id: 'app_1',
      baseId: 'bse_1',
      currentVersionId: 'apv_1',
      publicSlug: 'a1b2c3d4e5f6',
      publishedAt: new Date(),
    });
    svc.getSnapshotByAppId.mockResolvedValueOnce({
      appId: 'app_1',
      appName: 'My Dashboard',
      versionNumber: 3,
      deployedAt: '2026-09-03T10:00:00.000Z',
      snapshot: {
        files: [{ path: 'index.tsx', content: 'export default () => null' }],
        components: ['Header', 'Grid'],
      },
    });
    const res = buildResponse();

    await controller.runtime('a1b2c3d4e5f6', res as never);

    expect(svc.resolveBySlug).toHaveBeenCalledWith('a1b2c3d4e5f6');
    expect(svc.getSnapshotByAppId).toHaveBeenCalledWith('app_1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.type).toHaveBeenCalledWith('text/html; charset=utf-8');
    const sendArg = (res.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sendArg).toContain('<!doctype html>');
    expect(sendArg).toContain('My Dashboard');
    expect(sendArg).toContain('a1b2c3d4e5f6');
    expect(sendArg).toContain('Version');
    expect(sendArg).toContain('3');
    expect(sendArg).toContain('2026-09-03T10:00:00.000Z');
    expect(sendArg).toContain('index.tsx');
    expect(sendArg).toContain('Header');
  });

  it('escapes HTML special characters in the app name + slug + snapshot', async () => {
    svc.resolveBySlug.mockResolvedValueOnce({
      id: 'app_2',
      baseId: 'bse_2',
      currentVersionId: 'apv_2',
      publicSlug: '<bad slug>',
      publishedAt: new Date(),
    });
    svc.getSnapshotByAppId.mockResolvedValueOnce({
      appId: 'app_2',
      appName: '<script>alert("xss")</script>',
      versionNumber: 1,
      deployedAt: '2026-09-03T11:00:00.000Z',
      snapshot: { markup: '<img src=x onerror=alert(1)>' },
    });
    const res = buildResponse();

    await controller.runtime('<bad slug>', res as never);

    const sendArg = (res.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    // raw injection must not appear in the HTML body
    expect(sendArg).not.toContain('<script>alert("xss")</script>');
    expect(sendArg).not.toContain('<img src=x onerror=alert(1)>');
    // escaped forms must appear
    expect(sendArg).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(sendArg).toContain('&lt;bad slug&gt;');
    expect(sendArg).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('returns 404 when getSnapshotByAppId yields null but resolveBySlug succeeded (data-integrity guard)', async () => {
    svc.resolveBySlug.mockResolvedValueOnce({
      id: 'app_3',
      baseId: 'bse_3',
      currentVersionId: 'apv_3',
      publicSlug: 'a1b2c3d4e5f6',
      publishedAt: new Date(),
    });
    svc.getSnapshotByAppId.mockResolvedValueOnce(null);
    const res = buildResponse();

    await expect(controller.runtime('a1b2c3d4e5f6', res as never)).rejects.toThrow(
      /no deployable snapshot/
    );
  });
});
