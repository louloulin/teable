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
import { WebhookDeliveryAuthService } from './webhook-delivery.auth.service';

/**
 * NestJS-injectable wrapper around the pure helper functions exported
 * from `webhook-delivery.service.ts`. The underlying helpers are
 * copied verbatim from the supervisor branch — this class only adds a
 * thin DI surface so downstream modules can inject a single service
 * reference.
 */
export class WebhookDeliveryService {
  isWebhookStatus = isWebhookStatus;
  isTerminalStatus = isTerminalStatus;
  computeBackoff = computeBackoff;
  signBody = signBody;
  buildRequestHeaders = buildRequestHeaders;
  isValidUrl = isValidUrl;
  endpointAcceptsEvent = endpointAcceptsEvent;
  decideNextStatus = decideNextStatus;
  advanceDelivery = advanceDelivery;
  toRow = toRow;
  pickDueDeliveries = pickDueDeliveries;
  newDeliveryId = newDeliveryId;
  buildPayload = buildPayload;
}

@Module({
  providers: [WebhookDeliveryService, WebhookDeliveryAuthService],
  exports: [WebhookDeliveryService, WebhookDeliveryAuthService],
})
export class WebhookDeliveryModule {}
