/**
 * Health module — bundles the liveness and readiness controllers so the root
 * `AppModule` can register both endpoints with a single import.
 *
 * License: AGPL-3.0
 */

import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { ReadyController } from './ready.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController, ReadyController],
})
export class HealthModule {}
