/* eslint-disable @typescript-eslint/naming-convention */
import { UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';

import { AccessTokenAuthService } from './access-token.auth.service';
import { formatAccessTokenId, parseAccessTokenPrefix } from './access-token.helpers';

interface IMockAccessTokenTable {
  findUnique: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  accessToken: IMockAccessTokenTable;
}

const buildPrisma = (): IMockPrisma => ({
  accessToken: {
    findUnique: vi.fn(),
  },
});

describe('AccessTokenAuthService (thin-DI wrapper)', () => {
  let prisma: IMockPrisma;
  let svc: AccessTokenAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new AccessTokenAuthService(prisma as never);
  });

  it('validate() returns userId + accessTokenId when token is found and unexpired', async () => {
    prisma.accessToken.findUnique.mockResolvedValueOnce({
      id: 'tok1',
      userId: 'u1',
      sign: 'abc',
      expiredTime: new Date('2030-01-01T00:00:00Z'),
      lastUsedTime: null,
    });
    const out = await svc.validate('tok1');
    expect(out.userId).toBe('u1');
    expect(out.accessTokenId).toBe('tok1');
  });

  it('validate() throws UnauthorizedException when token is not found', async () => {
    prisma.accessToken.findUnique.mockResolvedValueOnce(null);
    await expect(svc.validate('missing')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validate() throws UnauthorizedException when token has expired', async () => {
    prisma.accessToken.findUnique.mockResolvedValueOnce({
      id: 'tok1',
      userId: 'u1',
      sign: 'abc',
      expiredTime: new Date('2020-01-01T00:00:00Z'),
      lastUsedTime: null,
    });
    await expect(svc.validate('tok1')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('formatAccessTokenId trims whitespace', () => {
    expect(formatAccessTokenId('  abc  ')).toBe('abc');
  });

  it('parseAccessTokenPrefix returns null for empty input', () => {
    expect(parseAccessTokenPrefix('   ')).toBeNull();
  });

  it('parseAccessTokenPrefix returns substring before first underscore', () => {
    expect(parseAccessTokenPrefix('tbk_xyz123')).toBe('tbk');
  });
});
