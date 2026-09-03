import { beforeEach, describe, expect, it } from 'vitest';
import { AiAppBuilderService } from './ai-app-builder.service';

describe('AiAppBuilderService secret storage', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalIntegrationSecret = process.env.TEABLE_INTEGRATION_SECRET;

  beforeEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalIntegrationSecret === undefined) delete process.env.TEABLE_INTEGRATION_SECRET;
    else process.env.TEABLE_INTEGRATION_SECRET = originalIntegrationSecret;
  });

  it('fails closed in production when the encryption secret is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.TEABLE_INTEGRATION_SECRET;
    const prisma = { appSecret: { upsert: async () => undefined } };
    const service = new AiAppBuilderService(prisma as never);

    await expect(service.putSecret('app_1', 'API_KEY', 'secret')).rejects.toThrow(
      'TEABLE_INTEGRATION_SECRET is required'
    );
  });

  it('stores an authenticated envelope instead of reversible base64', async () => {
    process.env.NODE_ENV = 'test';
    process.env.TEABLE_INTEGRATION_SECRET = 'test-integration-secret';
    let stored: Record<string, unknown> | undefined;
    const prisma = {
      appSecret: {
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          stored = create;
          return { ...create, updatedAt: new Date(), createdAt: new Date() };
        },
      },
    };
    const service = new AiAppBuilderService(prisma as never);

    await service.putSecret('app_1', 'API_KEY', 'secret');

    expect(stored?.valueCiphertext).toMatch(/^v1:/);
    expect(stored?.valueCiphertext).not.toBe(Buffer.from('secret').toString('base64'));
  });
});
