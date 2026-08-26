import { Module } from '@nestjs/common';

import {
  advanceDelivery,
  buildPayload,
  buildRequestHeaders,
  computeBackoff,
  decideNextStatus,
  endpointAcceptsEvent,
  isTerminalStatus,
  isValidUrl,
  isWebhookStatus,
  newDeliveryId,
  pickDueDeliveries,
  signBody,
  toRow,
} from './webhook-delivery.service';

/**
 * Pure-function helpers for webhook delivery — no Nest DI surface, consumed
 * directly by callers. Wave 6 surfaces that the previous thin-DI wrapper
 * class was never @Injectable() and could not be wired; we removed it.
 */
export const WebhookDeliveryService = {
  isWebhookStatus,
  isTerminalStatus,
  computeBackoff,
  signBody,
  buildRequestHeaders,
  isValidUrl,
  endpointAcceptsEvent,
  decideNextStatus,
  advanceDelivery,
  toRow,
  pickDueDeliveries,
  newDeliveryId,
  buildPayload,
};

@Module({})
export class WebhookDeliveryModule {}
