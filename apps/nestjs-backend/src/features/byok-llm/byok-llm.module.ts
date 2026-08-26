import { Module } from '@nestjs/common';

import {
  aggregateOrgUsage,
  buildUsageRow,
  canRegisterMore,
  computeHealth,
  fingerprintKey,
  hashAttempt,
  normalizeProviderKey,
  routeRequest,
  shouldMarkExhausted,
  suggestAlias,
  validateProviderKey,
} from './byok-llm.service';

/**
 * Pure-function helpers for BYOK LLM — no Nest DI surface, consumed directly
 * by callers. Wave 6 surfaces that the previous thin-DI wrapper class was
 * never @Injectable() and could not be wired; we removed it.
 */
export const ByokLlmService = {
  fingerprintKey,
  suggestAlias,
  validateProviderKey,
  normalizeProviderKey,
  canRegisterMore,
  buildUsageRow,
  aggregateOrgUsage,
  computeHealth,
  routeRequest,
  hashAttempt,
  shouldMarkExhausted,
};

@Module({})
export class ByokLlmModule {}
