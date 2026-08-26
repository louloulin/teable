import { Module } from '@nestjs/common';

import { InvitationAuthService } from './invitation.auth.service';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';

/**
 * Invitation module — thin-DI wrapper (Stage N).
 *
 * Carries the existing controller/service as-is and adds the auth-only
 * surface (`InvitationAuthService`) so callers don't need to pull in the
 * full NestJS service graph just to validate an invitation id.
 */
@Module({
  providers: [InvitationService, InvitationAuthService],
  controllers: [InvitationController],
  exports: [InvitationService, InvitationAuthService],
})
export class InvitationModule {}