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

/**
 * Pure-function helpers for webhook canvas — no Nest DI surface, consumed
 * directly by callers. Wave 6 surfaces that the previous thin-DI wrapper
 * class was never @Injectable() and could not be wired; we removed it.
 */
export const WebhookCanvasService = {
  validateWebhookCanvas,
  topoSortWebhook,
  planWebhookExecution,
  addWebhookNode,
  removeWebhookNode,
  addWebhookEdge,
  removeWebhookEdge,
  moveWebhookNode,
  serializeWebhookCanvas,
  summarizeWebhookCanvas,
  groupWebhookNodesByKind,
};

@Module({})
export class WebhookCanvasModule {}
