/**
 * Access-token — thin-DI wrapper (Stage N).
 *
 * Single-method auth surface: validate an API token by id. Uses only
 * `findUnique` against Prisma; defers lifecycle work to `AccessTokenService`.
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { isAccessTokenExpired } from './access-token.helpers';
import type { IAccessTokenRecord, IValidatedAccessToken } from './access-token.types';

@Injectable()
export class AccessTokenAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a token row by id. Throws `UnauthorizedException` when invalid. */
  async validate(tokenId: string): Promise<IValidatedAccessToken> {
    const row = await this.prisma.accessToken.findUnique({
      where: { id: tokenId },
      select: {
        id: true,
        userId: true,
        sign: true,
        expiredTime: true,
        lastUsedTime: true,
      },
    });
    if (!row) {
      throw new UnauthorizedException('token not found');
    }
    const record: IAccessTokenRecord = {
      id: row.id,
      userId: row.userId,
      sign: row.sign,
      expiredTime: row.expiredTime,
      lastUsedTime: row.lastUsedTime,
    };
    if (isAccessTokenExpired(record)) {
      throw new UnauthorizedException('token expired');
    }
    return {
      userId: record.userId,
      accessTokenId: record.id,
      expiredTime: record.expiredTime?.toISOString() ?? null,
    };
  }
}
