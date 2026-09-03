import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupController } from './backup.controller';

describe('BackupController authorization', () => {
  const service = { createBackup: vi.fn() };
  const cls = { get: vi.fn() };
  let controller: BackupController;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TEABLE_ADMIN_TOKEN;
    controller = new BackupController(service as never, cls as never);
  });

  it('rejects requests without an administrator', async () => {
    cls.get.mockReturnValue(undefined);
    await expect(controller.create({ baseId: 'base_1', createdBy: 'attacker' })).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(service.createBackup).not.toHaveBeenCalled();
  });

  it('rejects a normal authenticated user', async () => {
    cls.get.mockReturnValue({ id: 'user_1', isAdmin: false });
    await expect(controller.create({ baseId: 'base_1', createdBy: 'attacker' })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(service.createBackup).not.toHaveBeenCalled();
  });

  it('uses the authenticated administrator instead of the body actor', async () => {
    cls.get.mockReturnValue({ id: 'admin_1', isAdmin: true });
    service.createBackup.mockResolvedValue({ id: 'snapshot_1' });

    await controller.create({ baseId: 'base_1', createdBy: 'attacker' });

    expect(service.createBackup).toHaveBeenCalledWith({
      baseId: 'base_1',
      createdBy: 'admin_1',
      archiveDir: undefined,
    });
  });

  it('accepts a configured instance token and records its fixed actor', async () => {
    process.env.TEABLE_ADMIN_TOKEN = 'instance-secret';
    cls.get.mockReturnValue(undefined);
    service.createBackup.mockResolvedValue({ id: 'snapshot_1' });

    await controller.create({ baseId: 'base_1', createdBy: 'attacker' }, 'instance-secret');

    expect(service.createBackup).toHaveBeenCalledWith({
      baseId: 'base_1',
      createdBy: 'admin-token',
      archiveDir: undefined,
    });
  });
});
