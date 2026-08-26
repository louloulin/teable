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

/**
 * Pure-function helpers for webhook bridge — no Nest DI surface, consumed
 * directly by callers. Wave 6 surfaces that the previous thin-DI wrapper
 * class was never @Injectable() and could not be wired; we removed it.
 */
export const WebhookBridgeService = {
  computeHmacSignature,
  safeEqualHex,
  verifyInboundAuth,
  detectEventType,
  matchesEventFilter,
  validateBridge,
  buildRoutedEvent,
  buildDispatch,
};

@Module({})
export class WebhookBridgeModule {}
