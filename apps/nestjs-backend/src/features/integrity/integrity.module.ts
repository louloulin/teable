import { Module } from '@nestjs/common';

import { IntegrityAuthService } from './integrity.auth.service';
import { IntegrityController } from './integrity.controller';
import { IntegrityV2Controller } from './integrity-v2.controller';
import { IntegrityV2Service } from './integrity-v2.service';
import { LinkFieldService } from './link-field.service';
import { LinkIntegrityService } from './link-integrity.service';
import { UniqueIndexService } from './unique-index.service';

/**
 * Integrity module — thin-DI wrapper (Stage N).
 *
 * Carries the existing controllers/services as-is and adds the auth-only
 * surface (`IntegrityAuthService`) so callers can summarize drift without
 * pulling in the full scan/repair graph.
 */
@Module({
  providers: [
    IntegrityV2Service,
    LinkFieldService,
    LinkIntegrityService,
    UniqueIndexService,
    IntegrityAuthService,
  ],
  controllers: [IntegrityController, IntegrityV2Controller],
  exports: [IntegrityV2Service, LinkFieldService, LinkIntegrityService, UniqueIndexService, IntegrityAuthService],
})
export class IntegrityModule {}