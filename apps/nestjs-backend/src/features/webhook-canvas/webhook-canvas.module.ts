import { Module } from '@nestjs/common';

import {
  addWebhookEdge,
  addWebhookNode,
  groupWebhookNodesByKind,
  moveWebhookNode,
  planWebhookExecution,
  removeWebhookEdge,
  removeWebhookNode,
  serializeWebhookCanvas,
  summarizeWebhookCanvas,
  topoSortWebhook,
  validateWebhookCanvas,
} from './webhook-canvas.service';
import { WebhookCanvasAuthService } from './webhook-canvas.auth.service';

/**
 * NestJS-injectable wrapper around the pure helper functions exported
 * from `webhook-canvas.service.ts`. The underlying helpers are
 * copied verbatim from the supervisor branch — this class only adds a
 * thin DI surface so downstream modules can inject a single service
 * reference.
 */
export class WebhookCanvasService {
  validateWebhookCanvas = validateWebhookCanvas;
  topoSortWebhook = topoSortWebhook;
  planWebhookExecution = planWebhookExecution;
  addWebhookNode = addWebhookNode;
  removeWebhookNode = removeWebhookNode;
  addWebhookEdge = addWebhookEdge;
  removeWebhookEdge = removeWebhookEdge;
  moveWebhookNode = moveWebhookNode;
  serializeWebhookCanvas = serializeWebhookCanvas;
  summarizeWebhookCanvas = summarizeWebhookCanvas;
  groupWebhookNodesByKind = groupWebhookNodesByKind;
}

@Module({
  providers: [WebhookCanvasService, WebhookCanvasAuthService],
  exports: [WebhookCanvasService, WebhookCanvasAuthService],
})
export class WebhookCanvasModule {}
