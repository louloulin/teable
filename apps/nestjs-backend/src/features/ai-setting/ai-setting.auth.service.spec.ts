/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-AI-7b: Mirror `aiGatewayApiKey` / `aiGatewayBaseUrl` from the admin
 * ai_setting module into the canonical `meta.setting.aiConfig` row so the
 * AI runtime can pick them up via `SettingService.getSetting()`. Without
 * the mirror, admin UI changes never reach `ai.service.ts` because it
 * reads `name='aiConfig'` while this module persists to `name='ai_config'`.
 *
 * These tests exercise the mirror at the persistence boundary by mocking
 * the PrismaService and inspecting the writes that flow into the
 * `aiConfig` row.
 */
import { beforeEach, expect, it, vi } from 'vitest';
import type { PrismaService } from '@teable/db-main-prisma';
import { AiSettingAuthService } from './ai-setting.auth.service';
import type { SettingService } from '../setting/setting.service';

interface ISettingRow {
  name: string;
  content: string;
  createdBy?: string;
  lastModifiedBy?: string;
}

class FakePrisma {
  rows: Map<string, ISettingRow> = new Map();

  setting = {
    findFirst: vi.fn(async ({ where }: { where: { name: string } }) => {
      return this.rows.get(where.name) ?? null;
    }),
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { name: string };
        create: ISettingRow;
        update: Partial<ISettingRow>;
      }) => {
        const existing = this.rows.get(where.name);
        if (!existing) {
          this.rows.set(where.name, { ...create });
          return create;
        }
        Object.assign(existing, update);
        return existing;
      }
    ),
  };
}

const makeService = () => {
  const prisma = new FakePrisma();
  const settingService = {} as SettingService;
  const svc = new AiSettingAuthService(
    prisma as unknown as PrismaService,
    settingService
  );
  return { svc, prisma };
};

beforeEach(() => {
  vi.clearAllMocks();
});

it('R-AI-7b: update() mirrors gateway fields into aiConfig row', async () => {
  const { svc, prisma } = makeService();

  // Pre-populate aiConfig row with existing LLM provider config that must
  // be preserved by the mirror.
  prisma.rows.set('aiConfig', {
    name: 'aiConfig',
    content: JSON.stringify({
      enable: true,
      chatModel: { lg: 'openai@gpt-4o-mini@teable' },
      llmProviders: [
        {
          type: 'openai',
          name: 'teable',
          apiKey: 'sk-existing',
          baseUrl: 'https://api.openai.com/v1',
          models: 'gpt-4o-mini',
        },
      ],
    }),
  });

  await svc.update({
    enabled: true,
    defaultModel: 'gpt-4o-mini',
    aiGatewayApiKey: 'vck_test_9999',
    aiGatewayBaseUrl: 'https://ai-gateway.vercel.sh/v1',
  });

  const aiConfigRow = prisma.rows.get('aiConfig');
  expect(aiConfigRow).toBeDefined();
  const parsed = JSON.parse(aiConfigRow!.content);
  expect(parsed.aiGatewayApiKey).toBe('vck_test_9999');
  expect(parsed.aiGatewayBaseUrl).toBe('https://ai-gateway.vercel.sh/v1');
  // Preserves prior LLM provider config that ai.service still needs.
  expect(parsed.enable).toBe(true);
  expect(parsed.chatModel.lg).toBe('openai@gpt-4o-mini@teable');
  expect(parsed.llmProviders[0].apiKey).toBe('sk-existing');
  expect(parsed.llmProviders[0].models).toBe('gpt-4o-mini');
});

it('R-AI-7b: setGateway() with null clears mirrored apiKey but preserves baseUrl behavior', async () => {
  const { svc, prisma } = makeService();

  // First PUT — enable gateway.
  await svc.setGateway('vck_first', 'https://gateway-1.example/v1');
  let parsed = JSON.parse(prisma.rows.get('aiConfig')!.content);
  expect(parsed.aiGatewayApiKey).toBe('vck_first');
  expect(parsed.aiGatewayBaseUrl).toBe('https://gateway-1.example/v1');

  // Second PUT — clear apiKey only.
  await svc.setGateway(null, null);
  parsed = JSON.parse(prisma.rows.get('aiConfig')!.content);
  expect(parsed.aiGatewayApiKey).toBeNull();
  // baseUrl preserved by setGateway's null-coalescing on the caller side.
  expect(parsed.aiGatewayBaseUrl).toBe('https://gateway-1.example/v1');
});

it('R-AI-7b: aiConfig row is created when missing (no prior content)', async () => {
  const { svc, prisma } = makeService();

  await svc.setGateway('vck_fresh', 'https://gateway-fresh.example/v1');

  const aiConfigRow = prisma.rows.get('aiConfig');
  expect(aiConfigRow).toBeDefined();
  const parsed = JSON.parse(aiConfigRow!.content);
  expect(parsed.aiGatewayApiKey).toBe('vck_fresh');
  expect(parsed.aiGatewayBaseUrl).toBe('https://gateway-fresh.example/v1');
});
