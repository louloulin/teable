/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomAiModelAuthService } from './custom-ai-model.auth.service';

const safeFetch = vi.hoisted(() => vi.fn());
vi.mock('../../utils/ssrf-http', () => ({ safeFetch }));

function buildPrisma() {
  let row: any;
  return {
    byokLlmKey: {
      create: vi.fn(async ({ data }: any) => {
        row = {
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return row;
      }),
      findUnique: vi.fn(async () => row ?? null),
      findMany: vi.fn(async () => (row ? [row] : [])),
      update: vi.fn(async ({ data }: any) => {
        row = { ...row, ...data, updatedAt: new Date() };
        return row;
      }),
      delete: vi.fn(async () => row),
    },
    byokLlmAttempt: {
      findMany: vi.fn(async () => []),
    },
  };
}

describe('CustomAiModelAuthService capability tests', () => {
  beforeEach(() => {
    safeFetch.mockReset();
  });

  it('probes chat, vision, and image generation for an image model', async () => {
    safeFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const prisma = buildPrisma();
    const service = new CustomAiModelAuthService(prisma as never);

    const model = await service.createModel({
      orgId: 'org-1',
      provider: 'custom-openai',
      alias: 'vision-image',
      baseUrl: 'https://provider.example/v1',
      modelName: 'model-1',
      apiKey: 'secret',
      imageGenerationModel: true,
    });
    const result = await service.testModel('org-1', model.id);

    expect(result).toMatchObject({
      ok: true,
      capabilities: { chat: true, vision: true, imageGeneration: true },
    });
    expect(safeFetch).toHaveBeenCalledTimes(3);
    expect(safeFetch.mock.calls[0][0]).toBe('https://provider.example/v1/chat/completions');
    expect(safeFetch.mock.calls[1][1].body).toContain('image_url');
    expect(safeFetch.mock.calls[2][0]).toBe('https://provider.example/v1/images/generations');
    expect(safeFetch.mock.calls[2][1].body).toContain('Generate a small abstract blue square.');
    expect(safeFetch.mock.calls[0][1].headers.authorization).toBe('Bearer secret');
  });

  it('reports failed optional capabilities without hiding chat reachability', async () => {
    safeFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 400 })
      .mockResolvedValueOnce({ ok: false, status: 404 });
    const prisma = buildPrisma();
    const service = new CustomAiModelAuthService(prisma as never);
    const model = await service.createModel({
      orgId: 'org-1',
      provider: 'custom-openai',
      alias: 'text-only',
      baseUrl: 'https://provider.example/v1',
      modelName: 'model-1',
      imageGenerationModel: true,
    });

    const result = await service.testModel('org-1', model.id);

    expect(result.ok).toBe(true);
    expect(result.capabilities).toEqual({ chat: true, vision: false, imageGeneration: false });
  });
});
