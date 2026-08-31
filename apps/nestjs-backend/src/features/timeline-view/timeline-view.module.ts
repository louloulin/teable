import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { LicenseModule } from '../license/license.module';
import { TimelineViewAuthController } from './timeline-view.auth.controller';
import { TimelineViewAuthService } from './timeline-view.auth.service';

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [TimelineViewAuthController],
  providers: [TimelineViewAuthService],
  exports: [TimelineViewAuthService],
})
export class TimelineViewModule {}
