import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenericConnectorController } from './generic-connector.controller';

describe('GenericConnectorController authorization', () => {
  const service = {
    probe: vi.fn(() => ({ ok: true })),
    listAdapters: vi.fn(() => ({ total: 0, adapters: [] })),
    register: vi.fn(),
    fetch: vi.fn(),
  };
  const cls = { get: vi.fn() };
  let controller: GenericConnectorController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new GenericConnectorController(service as never, cls as never);
  });

  it('keeps registry inspection public', () => {
    expect(controller.probe()).toEqual({ ok: true });
    expect(controller.adapters()).toEqual({ total: 0, adapters: [] });
  });

  it('rejects anonymous adapter registration', () => {
    cls.get.mockReturnValue(false);
    expect(() => controller.register({ type: 'vendor' })).toThrow(ForbiddenException);
    expect(service.register).not.toHaveBeenCalled();
  });

  it('rejects anonymous fetch before dispatching an adapter', async () => {
    cls.get.mockReturnValue(undefined);
    await expect(
      controller.fetch({ spec: { adapterType: 'json-endpoint', endpoint: 'https://example.com' } })
    ).rejects.toThrow(UnauthorizedException);
    expect(service.fetch).not.toHaveBeenCalled();
  });

  it('dispatches fetch for an authenticated user', async () => {
    cls.get.mockImplementation((key: string) => (key === 'user.id' ? 'user_1' : false));
    service.fetch.mockResolvedValue({ ok: true });
    await expect(
      controller.fetch({ spec: { adapterType: 'json-endpoint', endpoint: 'https://example.com' } })
    ).resolves.toEqual({ ok: true });
    expect(service.fetch).toHaveBeenCalledOnce();
  });
});
