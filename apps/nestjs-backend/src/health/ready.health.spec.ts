import type { ConfigService } from '@nestjs/config';
import type { ModuleRef } from '@nestjs/core';
import type { PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from '@teable/db-main-prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisNativeService } from '../cache/redis-native.service';
import { ReadyController } from './ready.controller';

describe('ReadyController', () => {
  let moduleRef: { get: ReturnType<typeof vi.fn> };
  let controller: ReadyController;
  let response: { status: ReturnType<typeof vi.fn> };
  const configService = { get: vi.fn() };
  const prisma = {};
  const indicator = { pingCheck: vi.fn() };
  const redis = { ping: vi.fn() };

  beforeEach(() => {
    moduleRef = { get: vi.fn() };
    response = { status: vi.fn() };
    controller = new ReadyController(
      moduleRef as unknown as ModuleRef,
      indicator as unknown as PrismaHealthIndicator,
      configService as unknown as ConfigService
    );
    indicator.pingCheck.mockReset().mockResolvedValue({ database: { status: 'up' } });
    configService.get.mockReset().mockReturnValue({ provider: 'redis' });
    redis.ping.mockReset().mockResolvedValue('PONG');
    moduleRef.get.mockImplementation((token: unknown) => {
      if (token === PrismaService) return prisma;
      if (token === RedisNativeService) return redis;
      throw new Error('not registered');
    });
  });

  it('checks the registered database and Redis clients', async () => {
    await expect(controller.ready(response as never)).resolves.toMatchObject({
      status: 'ok',
      checks: {
        db: { ok: true },
        redis: { ok: true },
      },
    });
    expect(indicator.pingCheck).toHaveBeenCalledWith('database', prisma);
    expect(redis.ping).toHaveBeenCalledTimes(1);
  });

  it('returns unavailable when a required dependency is not registered', async () => {
    moduleRef.get.mockImplementation(() => {
      throw new Error('not registered');
    });

    await expect(controller.ready(response as never)).resolves.toMatchObject({
      status: 'unavailable',
      checks: {
        db: { ok: false, error: 'db dependency is not registered' },
        redis: { ok: false, error: 'redis dependency is not registered' },
      },
    });
    expect(response.status).toHaveBeenCalledWith(503);
  });
});
