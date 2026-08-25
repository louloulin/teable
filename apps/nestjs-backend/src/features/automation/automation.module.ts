import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { LicenseModule } from '../license/license.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';

/**
 * Automation module — Stage 13 MVP.
 *
 * Exposes the read/write service and the REST controller. The actual
 * action dispatcher (Stage 14: webhook / email / IM) will live in a
 * sibling module and consume `AutomationService.trigger()` plus
 * `finishRun()` to record outcomes.
 */
@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
