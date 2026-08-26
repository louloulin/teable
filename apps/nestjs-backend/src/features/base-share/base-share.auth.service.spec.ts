/* eslint-disable @typescript-eslint/naming-convention */
import { UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';

import { BaseShareAuthService } from './base-share-auth.service';
import { checkSharePassword, formatShareTokenPermission } from './base-share.helpers';

interface IMockBaseShareTable {
  findUnique: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  baseShare: IMockBaseShareTable;
}
interface IMockJwt {
  verifyAsync: ReturnType<typeof vi.fn>;
  signAsync: ReturnType<typeof vi.fn>;
}

const buildPrisma = (): IMockPrisma => ({
  baseShare: {
    findUnique: vi.fn(),
  },
});

const buildJwt = (): IMockJwt => ({
  verifyAsync: vi.fn(),
  signAsync: vi.fn(),
});

describe('BaseShareAuthService (thin-DI wrapper)', () => {
  let prisma: IMockPrisma;
  let jwt: IMockJwt;
  let svc: BaseShareAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    jwt = buildJwt();
    svc = new BaseShareAuthService(prisma as never, jwt as never);
  });

  it('validateJwtToken returns the verified payload', async () => {
    jwt.verifyAsync.mockResolvedValueOnce({ shareId: 's1', password: 'p' });
    const out = await svc.validateJwtToken('token');
    expect(out.shareId).toBe('s1');
  });

  it('validateJwtToken throws UnauthorizedException on bad token', async () => {
    jwt.verifyAsync.mockRejectedValueOnce(new Error('bad'));
    await expect(svc.validateJwtToken('bad')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('authBaseShare returns the shareId when password matches', async () => {
    prisma.baseShare.findUnique.mockResolvedValueOnce({
      shareId: 's1',
      password: 'p',
      enabled: true,
    });
    const out = await svc.authBaseShare('s1', 'p');
    expect(out).toBe('s1');
  });

  it('authBaseShare returns null when share is disabled', async () => {
    prisma.baseShare.findUnique.mockResolvedValueOnce({
      shareId: 's1',
      password: 'p',
      enabled: false,
    });
    const out = await svc.authBaseShare('s1', 'p');
    expect(out).toBeNull();
  });

  it('authBaseShare returns null when password does not match', async () => {
    prisma.baseShare.findUnique.mockResolvedValueOnce({
      shareId: 's1',
      password: 'p',
      enabled: true,
    });
    const out = await svc.authBaseShare('s1', 'wrong');
    expect(out).toBeNull();
  });

  it('hasPassword returns true when share has a stored password', async () => {
    prisma.baseShare.findUnique.mockResolvedValueOnce({
      password: 'p',
      enabled: true,
    });
    const out = await svc.hasPassword('s1');
    expect(out).toBe(true);
  });

  it('hasPassword returns false when share has no password', async () => {
    prisma.baseShare.findUnique.mockResolvedValueOnce({
      password: null,
      enabled: true,
    });
    const out = await svc.hasPassword('s1');
    expect(out).toBe(false);
  });
});

describe('base-share helpers', () => {
  it('formatShareTokenPermission maps IBaseShareInfo into summary', () => {
    const summary = formatShareTokenPermission({
      shareId: 's1',
      baseId: 'b1',
      nodeId: null,
      allowSave: true,
      allowCopy: false,
      allowEdit: true,
    });
    expect(summary.allowEdit).toBe(true);
    expect(summary.allowCopy).toBe(false);
    expect(summary.allowView).toBe(true);
  });

  it('checkSharePassword returns ok when stored equals candidate', () => {
    expect(checkSharePassword('p', 'p')).toEqual({ matches: true, reason: 'ok' });
  });

  it('checkSharePassword returns no-password when stored is null', () => {
    expect(checkSharePassword(null, 'p')).toEqual({ matches: false, reason: 'no-password' });
  });

  it('checkSharePassword returns wrong-password when candidate is null', () => {
    expect(checkSharePassword('p', null)).toEqual({ matches: false, reason: 'wrong-password' });
  });
});
