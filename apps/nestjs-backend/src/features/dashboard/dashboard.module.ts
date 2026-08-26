import { Module } from '@nestjs/common';
import { BaseModule } from '../base/base.module';
import { CollaboratorModule } from '../collaborator/collaborator.module';
import { DashboardAuthService } from './dashboard.auth.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard — module (Stage 130).
 *
 * `DashboardAuthService` is the thin-DI wrapper façade; it is additive
 * and does not replace the existing controller / service surface.
 */
@Module({
  imports: [CollaboratorModule, BaseModule],
  providers: [DashboardService, DashboardAuthService],
  controllers: [DashboardController],
  exports: [DashboardService, DashboardAuthService],
})
export class DashboardModule {}