/**
 * Webhook Canvas — NestJS auth service (Stage 110).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

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
import {
  WebhookCanvasSpec,
  WebhookEdgeSpec,
  WebhookExecutionPlan,
  WebhookNodeSpec,
  WebhookValidationResult,
} from './webhook-canvas.types';

@Injectable()
export class WebhookCanvasAuthService {
  constructor(private readonly prisma: PrismaService) {}

  validate(canvas: WebhookCanvasSpec, catalog?: Record<string, readonly string[]>): WebhookValidationResult {
    return validateWebhookCanvas(canvas, catalog);
  }

  plan(canvas: WebhookCanvasSpec): WebhookExecutionPlan {
    return planWebhookExecution(canvas);
  }

  topo(canvas: WebhookCanvasSpec): string[] {
    return topoSortWebhook(canvas);
  }

  addNode(canvas: WebhookCanvasSpec, node: WebhookNodeSpec): WebhookCanvasSpec {
    return addWebhookNode(canvas, node);
  }

  removeNode(canvas: WebhookCanvasSpec, nodeId: string): WebhookCanvasSpec {
    return removeWebhookNode(canvas, nodeId);
  }

  addEdge(canvas: WebhookCanvasSpec, edge: WebhookEdgeSpec): WebhookCanvasSpec {
    return addWebhookEdge(canvas, edge);
  }

  removeEdge(canvas: WebhookCanvasSpec, edgeId: string): WebhookCanvasSpec {
    return removeWebhookEdge(canvas, edgeId);
  }

  moveNode(canvas: WebhookCanvasSpec, id: string, pos: { x: number; y: number }): WebhookCanvasSpec {
    return moveWebhookNode(canvas, id, pos);
  }

  groupByKind(canvas: WebhookCanvasSpec): Record<string, WebhookNodeSpec[]> {
    return groupWebhookNodesByKind(canvas);
  }

  summarize(canvas: WebhookCanvasSpec) {
    return summarizeWebhookCanvas(canvas);
  }

  serialize(canvas: WebhookCanvasSpec): string {
    return serializeWebhookCanvas(canvas);
  }

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}