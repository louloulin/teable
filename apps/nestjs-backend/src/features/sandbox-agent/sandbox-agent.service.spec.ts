import type { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import type { SettingService } from '../setting/setting.service';
import { SandboxAgentService } from './sandbox-agent.service';

describe('SandboxAgentService', () => {
  describe('getRuntimeStatus', () => {
    it('reports unconfigured when env vars are missing', () => {
      const svc = makeService({});
      expect(svc.getRuntimeStatus()).toEqual({
        configured: false,
        reachable: false,
        provider: null,
        error: null,
      });
    });

    it('reports configured but not reachable before a health probe', () => {
      const svc = makeService({
        TEABLE_INFRA_API_URL: 'https://infra.example.test',
        TEABLE_INFRA_API_KEY: 'secret',
      });
      expect(svc.getRuntimeStatus()).toEqual({
        configured: true,
        reachable: false,
        provider: 'https://infra.example.test',
        error: null,
      });
    });
  });

  describe('getSettings', () => {
    it('returns defaults when no sandboxConfig has been stored', async () => {
      const svc = makeService({}, { sandboxConfig: undefined });
      const settings = await svc.getSettings();
      expect(settings).toEqual({
        streamIdleTimeoutSec: 120,
        idleTimeoutSec: 1800,
        concurrentChatLimit: 4,
        vcpus: 2,
        memoryMb: 4096,
        temporaryDiskMb: 10240,
        thinkingEffort: 'medium',
      });
    });

    it('merges stored overrides over the defaults', async () => {
      const svc = makeService({}, { sandboxConfig: { concurrentChatLimit: 9, vcpus: 8 } });
      const settings = await svc.getSettings();
      expect(settings.concurrentChatLimit).toBe(9);
      expect(settings.vcpus).toBe(8);
      expect(settings.memoryMb).toBe(4096);
    });
  });

  describe('listSessions', () => {
    it('returns the unconfigured runtime status when env vars are missing', async () => {
      const svc = makeService({});
      const result = await svc.listSessions();
      expect(result.runtime.configured).toBe(false);
      expect(result.runtime.error).toBe('runtime-not-configured');
      expect(result.sessions).toEqual([]);
    });

    it('normalizes upstream session arrays and marks the runtime reachable on 200', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ id: 'sbx-1' }, { id: 'sbx-2' }],
      });
      vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
      const svc = makeService({
        TEABLE_INFRA_API_URL: 'https://infra.example.test',
        TEABLE_INFRA_API_KEY: 'secret',
      });
      const result = await svc.listSessions();
      expect(result.runtime.reachable).toBe(true);
      expect(result.runtime.error).toBeNull();
      expect(result.sessions.map((s) => s.id)).toEqual(['sbx-1', 'sbx-2']);
      vi.unstubAllGlobals();
    });

    it('captures non-200 responses without throwing', async () => {
      const fetchSpy = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
      vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
      const svc = makeService({
        TEABLE_INFRA_API_URL: 'https://infra.example.test',
        TEABLE_INFRA_API_KEY: 'secret',
      });
      const result = await svc.listSessions();
      expect(result.runtime.reachable).toBe(false);
      expect(result.runtime.error).toBe('runtime-http-502');
      expect(result.sessions).toEqual([]);
      vi.unstubAllGlobals();
    });
  });

  describe('terminateSession', () => {
    it('returns an unconfigured error when no runtime env is set', async () => {
      const svc = makeService({});
      const result = await svc.terminateSession('sbx-x');
      expect(result.ok).toBe(false);
      expect(result.runtime.configured).toBe(false);
      expect(result.runtime.error).toBe('runtime-not-configured');
    });

    it('treats 404 from the runtime plane as a successful termination', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 404 });
      vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
      const svc = makeService({
        TEABLE_INFRA_API_URL: 'https://infra.example.test',
        TEABLE_INFRA_API_KEY: 'secret',
      });
      const result = await svc.terminateSession('sbx-x');
      expect(result.ok).toBe(true);
      expect(result.status).toBe(404);
      vi.unstubAllGlobals();
    });
  });
});

function makeService(
  env: Record<string, string>,
  stored?: { sandboxConfig?: Record<string, unknown> }
) {
  const configService = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  const settingService = {
    getSetting: vi.fn().mockResolvedValue({ sandboxConfig: stored?.sandboxConfig }),
    updateSetting: vi.fn().mockResolvedValue(undefined),
  } as unknown as SettingService;
  return new SandboxAgentService(settingService, configService);
}
