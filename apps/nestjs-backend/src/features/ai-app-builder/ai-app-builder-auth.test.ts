import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AiAppBuilderController } from './ai-app-builder.controller';

describe('AiAppBuilderController authentication', () => {
  const createController = (userId?: string) => {
    const service = {
      createApp: vi.fn(),
      deploy: vi.fn(),
      rollback: vi.fn(),
    };
    const auth = { assertAppInBase: vi.fn().mockResolvedValue(undefined) };
    const cls = { get: vi.fn().mockReturnValue(userId) };
    const controller = new AiAppBuilderController(service as never, auth as never, cls as never);
    return { controller, service };
  };

  it('rejects unauthenticated app creation without calling the service', async () => {
    const { controller, service } = createController();

    await expect(controller.createApp('base_1', { name: 'Demo' })).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(service.createApp).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated deploy without calling the service', async () => {
    const { controller, service } = createController();

    await expect(controller.deploy('base_1', 'app_1', {})).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(service.deploy).not.toHaveBeenCalled();
  });

  it('passes the authenticated user to app creation', async () => {
    const { controller, service } = createController('usr_1');
    service.createApp.mockResolvedValue({ id: 'app_1' });

    await controller.createApp('base_1', { name: 'Demo' });

    expect(service.createApp).toHaveBeenCalledWith('base_1', 'Demo', undefined, 'usr_1');
  });
});
