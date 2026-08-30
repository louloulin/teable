import { BadRequestException } from '@nestjs/common';
import type { PermissionService } from '../auth/permission.service';
import type { AgentOrchestratorService } from './agent-orchestrator.service';
import { CuppyController } from './cuppy.controller';

describe('CuppyController', () => {
  it('uses the authenticated user and creates a conversation when omitted', async () => {
    const handle = vi.fn().mockResolvedValue({ text: '[echo] hello' });
    const controller = new CuppyController(
      { handle } as unknown as AgentOrchestratorService,
      { get: vi.fn().mockReturnValue('user-1') } as never,
      { validPermissions: vi.fn().mockResolvedValue([]) } as unknown as PermissionService
    );

    const result = await controller.chat({ message: 'hello' });

    expect(result.text).toBe('[echo] hello');
    expect(result.conversationId).toStrictEqual(expect.any(String));
    expect(handle).toHaveBeenCalledWith(
      result.conversationId,
      'user-1',
      expect.objectContaining({ user_id: 'user-1', text: 'hello' })
    );
  });

  it('preserves a supplied conversation id', async () => {
    const handle = vi.fn().mockResolvedValue({ text: 'ok' });
    const controller = new CuppyController(
      { handle } as unknown as AgentOrchestratorService,
      { get: vi.fn().mockReturnValue('user-1') } as never,
      { validPermissions: vi.fn().mockResolvedValue([]) } as unknown as PermissionService
    );

    await expect(
      controller.chat({ conversationId: 'conversation-1', message: 'hello' })
    ).resolves.toStrictEqual({ conversationId: 'conversation-1', text: 'ok' });
  });

  it('rejects requests without an authenticated user context', async () => {
    const controller = new CuppyController(
      { handle: vi.fn() } as unknown as AgentOrchestratorService,
      { get: vi.fn().mockReturnValue(undefined) } as never,
      { validPermissions: vi.fn() } as unknown as PermissionService
    );

    await expect(controller.chat({ message: 'hello' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checks read access before using a supplied base', async () => {
    const handle = vi.fn().mockResolvedValue({ text: 'ok' });
    const validPermissions = vi.fn().mockResolvedValue([]);
    const cls = { get: vi.fn().mockReturnValueOnce('user-1').mockReturnValueOnce('token-1') };
    const controller = new CuppyController(
      { handle } as unknown as AgentOrchestratorService,
      cls as never,
      { validPermissions } as unknown as PermissionService
    );

    await controller.chat({ baseId: 'base-1', message: 'hello' });

    expect(validPermissions).toHaveBeenCalledWith('base-1', ['base|read'], 'token-1');
    expect(handle).toHaveBeenCalled();
  });

  it('does not call the LLM when the supplied base is inaccessible', async () => {
    const handle = vi.fn();
    const validPermissions = vi.fn().mockRejectedValue(new Error('forbidden'));
    const controller = new CuppyController(
      { handle } as unknown as AgentOrchestratorService,
      { get: vi.fn().mockReturnValue('user-1') } as never,
      { validPermissions } as unknown as PermissionService
    );

    await expect(controller.chat({ baseId: 'base-1', message: 'hello' })).rejects.toThrow(
      'forbidden'
    );
    expect(handle).not.toHaveBeenCalled();
  });
});
