import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { LicenseCapabilityService } from './license-capability.service';

/**
 * Frontend-facing capability flags. Single GET endpoint so the UI can
 * render buttons / disable routes without hard-coding plan names.
 *
 * Auth: intentionally public — the snapshot leaks no sensitive data
 * (just which features are available, which is already inferable from
 * the public pricing page). Cloud instances can opt to gate this behind
 * auth by adding `@UseGuards(...)` later.
 */
@Controller('api/license')
export class LicenseCapabilityController {
  constructor(private readonly caps: LicenseCapabilityService) {}

  @Public()
  @Get('capabilities')
  capabilities() {
    return this.caps.snapshot();
  }

  @Public()
  @Get('plan')
  plan() {
    return { plan: this.caps.currentPlan() };
  }
}
