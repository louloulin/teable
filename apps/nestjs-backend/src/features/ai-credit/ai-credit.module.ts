/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * AI Credit — NestJS module wiring (Round-INFRA-2).
 *
 * Wraps AiCreditAuthService into the NestJS container so other feature
 * modules can import this one (and so the capability gate in
 * `/api/admin/enterprise-readiness` can probe it via `app.module.ts`).
 *
 * License: AGPL-3.0
 */
import { Module } from '@nestjs/common';
import { AiCreditAuthService } from './ai-credit.auth.service';
import { AiCreditController } from './ai-credit.controller';

@Module({
  controllers: [AiCreditController],
  providers: [AiCreditAuthService],
  exports: [AiCreditAuthService],
})
export class AiCreditModule {}
