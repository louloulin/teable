import { Module } from '@nestjs/common';
import { AccessTokenController } from './access-token.controller';
import { AccessTokenAuthService } from './access-token.auth.service';
import { AccessTokenService } from './access-token.service';

/**
 * Access-token module — thin-DI wrapper (Stage N).
 *
 * Carries the existing controller/service as-is and adds the auth-only
 * surface (`AccessTokenAuthService`) so callers don't need to pull in the
 * full NestJS service graph just to validate a token id.
 */
@Module({
  providers: [AccessTokenService, AccessTokenAuthService],
  controllers: [AccessTokenController],
  exports: [AccessTokenService, AccessTokenAuthService],
})
export class AccessTokenModule {}
