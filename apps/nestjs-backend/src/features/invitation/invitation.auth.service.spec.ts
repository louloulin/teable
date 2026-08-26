/* eslint-disable @typescript-eslint/naming-convention */
import { NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

import { InvitationAuthService } from './invitation.auth.service';
import { isInvitationExpired, normalizeInvitationEmail } from './invitation.helpers';

interface IMockInvitationTable {
  findUnique: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  invitation: IMockInvitationTable;
}

const buildPrisma = (): IMockPrisma => ({
  invitation: { findUnique: vi.fn() },
});

describe('InvitationAuthService (thin-DI wrapper)', () => {
  let prisma: IMockPrisma;
  let svc: InvitationAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new InvitationAuthService(prisma as never);
  });

  it('resolveInvitation returns the record when found', async () => {
    prisma.invitation.findUnique.mockResolvedValueOnce({
      id: 'inv1',
      spaceId: 'sp1',
      email: '  Foo@Bar.COM ',
      role: 'editor',
      invitedBy: 'u1',
      expiredTime: new Date('2030-01-01T00:00:00Z'),
    });
    const out = await svc.resolveInvitation('inv1');
    expect(out.spaceId).toBe('sp1');
    expect(out.email).toBe('foo@bar.com');
    expect(out.role).toBe('editor');
  });

  it('resolveInvitation throws when missing', async () => {
    prisma.invitation.findUnique.mockResolvedValueOnce(null);
    await expect(svc.resolveInvitation('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolveInvitation throws when expired', async () => {
    prisma.invitation.findUnique.mockResolvedValueOnce({
      id: 'inv1',
      spaceId: 'sp1',
      email: 'foo@bar.com',
      role: 'editor',
      invitedBy: 'u1',
      expiredTime: new Date('2020-01-01T00:00:00Z'),
    });
    await expect(svc.resolveInvitation('inv1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('normalizeInvitationEmail lowercases and trims', () => {
    expect(normalizeInvitationEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });

  it('isInvitationExpired detects past and future expiry', () => {
    expect(isInvitationExpired({ expiredTime: new Date('2020-01-01T00:00:00Z') })).toBe(true);
    expect(isInvitationExpired({ expiredTime: new Date('2099-01-01T00:00:00Z') })).toBe(false);
    expect(isInvitationExpired({ expiredTime: null })).toBe(false);
  });
});