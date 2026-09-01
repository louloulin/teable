/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * BYOK LLM — NestJS module wiring (Round-INFRA-4).
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { ByokLlmController } from './byok-llm.controller';
import { ByokLlmAuthService } from './byok-llm.auth.service';

@Module({
  imports: [LicenseModule],
  controllers: [ByokLlmController],
  providers: [ByokLlmAuthService],
  exports: [ByokLlmAuthService],
})
export class ByokLlmModule {}
