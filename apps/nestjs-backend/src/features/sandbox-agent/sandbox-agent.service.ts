/* eslint-disable @typescript-eslint/naming-convention */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingKey } from '@teable/openapi';
import type { ISandboxConfig } from '@teable/openapi';
import { SettingService } from '../setting/setting.service';

const DEFAULT_SANDBOX_CONFIG: ISandboxConfig = {
  streamIdleTimeoutSec: 120,
  idleTimeoutSec: 1800,
  concurrentChatLimit: 4,
  vcpus: 2,
  memoryMb: 4096,
  temporaryDiskMb: 10240,
  thinkingEffort: 'medium',
};

export interface ISandboxRuntimeStatus {
  configured: boolean;
  reachable: boolean;
  provider: string | null;
  error: string | null;
}

const RUNTIME_TIMEOUT_MS = 8000;

@Injectable()
export class SandboxAgentService {
  private readonly logger = new Logger(SandboxAgentService.name);

  constructor(
    private readonly settingService: SettingService,
    private readonly configService: ConfigService
  ) {}

  async getSettings(): Promise<ISandboxConfig> {
    const { sandboxConfig } = await this.settingService.getSetting([SettingKey.SANDBOX_CONFIG]);
    if (sandboxConfig && typeof sandboxConfig === 'object') {
      return { ...DEFAULT_SANDBOX_CONFIG, ...(sandboxConfig as ISandboxConfig) };
    }
    return DEFAULT_SANDBOX_CONFIG;
  }

  async updateSettings(input: Partial<ISandboxConfig>): Promise<ISandboxConfig> {
    const next = { ...(await this.getSettings()), ...input };
    await this.settingService.updateSetting({
      [SettingKey.SANDBOX_CONFIG]: next,
    } as never);
    return next;
  }

  getRuntimeStatus(): ISandboxRuntimeStatus {
    const apiUrl = this.configService.get<string>('TEABLE_INFRA_API_URL');
    const apiKey = this.configService.get<string>('TEABLE_INFRA_API_KEY');
    if (!apiUrl || !apiKey) {
      return { configured: false, reachable: false, provider: null, error: null };
    }
    return { configured: true, reachable: false, provider: apiUrl, error: null };
  }

  async listSessions(): Promise<{
    runtime: ISandboxRuntimeStatus;
    sessions: Array<Record<string, unknown>>;
  }> {
    const runtime = this.getRuntimeStatus();
    if (!runtime.configured) {
      return { runtime: { ...runtime, error: 'runtime-not-configured' }, sessions: [] };
    }
    const apiUrl = this.configService.get<string>('TEABLE_INFRA_API_URL')!;
    const apiKey = this.configService.get<string>('TEABLE_INFRA_API_KEY')!;
    try {
      const res = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/sandboxes`, {
        headers: { 'OPEN-SANDBOX-API-KEY': apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(RUNTIME_TIMEOUT_MS),
      });
      if (!res.ok) {
        return {
          runtime: { ...runtime, error: `runtime-http-${res.status}` },
          sessions: [],
        };
      }
      const body = (await res.json()) as unknown;
      const sessions = Array.isArray(body)
        ? (body as Array<Record<string, unknown>>)
        : Array.isArray((body as { items?: unknown[] })?.items)
          ? (body as { items: Array<Record<string, unknown>> }).items
          : [];
      return { runtime: { ...runtime, reachable: true }, sessions };
    } catch (error) {
      return {
        runtime: { ...runtime, error: error instanceof Error ? error.message : 'runtime-error' },
        sessions: [],
      };
    }
  }

  async terminateSession(
    id: string
  ): Promise<{ ok: boolean; runtime: ISandboxRuntimeStatus; status?: number; error?: string }> {
    const runtime = this.getRuntimeStatus();
    if (!runtime.configured) {
      return { ok: false, runtime: { ...runtime, error: 'runtime-not-configured' } };
    }
    const apiUrl = this.configService.get<string>('TEABLE_INFRA_API_URL')!;
    const apiKey = this.configService.get<string>('TEABLE_INFRA_API_KEY')!;
    try {
      const res = await fetch(
        `${apiUrl.replace(/\/$/, '')}/v1/sandboxes/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          headers: { 'OPEN-SANDBOX-API-KEY': apiKey },
          signal: AbortSignal.timeout(RUNTIME_TIMEOUT_MS),
        }
      );
      if (!res.ok && res.status !== 404) {
        return { ok: false, runtime, status: res.status, error: `runtime-http-${res.status}` };
      }
      return { ok: true, runtime, status: res.status };
    } catch (error) {
      return {
        ok: false,
        runtime,
        error: error instanceof Error ? error.message : 'runtime-error',
      };
    }
  }
}
