import { Module } from '@nestjs/common';

import {
  buildDispatch,
  buildRoutedEvent,
  computeHmacSignature,
  detectEventType,
  matchesEventFilter,
  safeEqualHex,
  validateBridge,
  verifyInboundAuth,
} from './webhook-bridge.service';
import { WebhookBridgeAuthService } from './webhook-bridge.auth.service';

/**
 * NestJS-injectable wrapper around the pure helper functions exported
 * from `webhook-bridge.service.ts`. The underlying helpers are
 * copied verbatim from the supervisor branch — this class only adds a
 * thin DI surface so downstream modules can inject a single service
 * reference.
 */
export class WebhookBridgeService {
  computeHmacSignature = computeHmacSignature;
  safeEqualHex = safeEqualHex;
  verifyInboundAuth = verifyInboundAuth;
  detectEventType = detectEventType;
  matchesEventFilter = matchesEventFilter;
  validateBridge = validateBridge;
  buildRoutedEvent = buildRoutedEvent;
  buildDispatch = buildDispatch;
}

@Module({
  providers: [WebhookBridgeService, WebhookBridgeAuthService],
  exports: [WebhookBridgeService, WebhookBridgeAuthService],
})
export class WebhookBridgeModule {}
