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
import { ByokLlmAuthService } from './byok-llm.auth.service';

/**
 * NestJS-injectable wrapper around the pure helper functions exported
 * from `byok-llm.service.ts`. The underlying helpers are
 * copied verbatim from the supervisor branch — this class only adds a
 * thin DI surface so downstream modules can inject a single service
 * reference.
 */
export class ByokLlmService {
  fingerprintKey = fingerprintKey;
  suggestAlias = suggestAlias;
  validateProviderKey = validateProviderKey;
  normalizeProviderKey = normalizeProviderKey;
  canRegisterMore = canRegisterMore;
  buildUsageRow = buildUsageRow;
  aggregateOrgUsage = aggregateOrgUsage;
  computeHealth = computeHealth;
  routeRequest = routeRequest;
  hashAttempt = hashAttempt;
  shouldMarkExhausted = shouldMarkExhausted;
}

@Module({
  providers: [ByokLlmService, ByokLlmAuthService],
  exports: [ByokLlmService, ByokLlmAuthService],
})
export class ByokLlmModule {}
