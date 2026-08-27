/**
 * NestJS module wiring for the prompt router.
 *
 * Production wires `IntentClassifier` from the existing `ai` LLM provider;
 * tests / offline deployments run with the keyword-only fallback.
 *
 * License: AGPL-3.0
 */

import { Module } from '@nestjs/common';
import { CuppyPromptRouter } from './cuppy-prompt-router';

@Module({
  providers: [{ provide: CuppyPromptRouter, useFactory: () => new CuppyPromptRouter() }],
  exports: [CuppyPromptRouter],
})
export class CuppyPromptRouterModule {}
