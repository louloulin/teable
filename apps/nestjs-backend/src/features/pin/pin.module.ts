import { Module } from '@nestjs/common';

import { PinAuthService } from './pin.auth.service';
import { PinController } from './pin.controller';
import { PinService } from './pin.service';

/**
 * Pin module — thin-DI wrapper (Stage N).
 *
 * Carries the existing controller/service as-is and adds the auth-only
 * surface (`PinAuthService`) so callers don't need to pull in the full
 * NestJS service graph just to resolve a pin.
 */
@Module({
  providers: [PinService, PinAuthService],
  controllers: [PinController],
  exports: [PinService, PinAuthService],
})
export class PinModule {}