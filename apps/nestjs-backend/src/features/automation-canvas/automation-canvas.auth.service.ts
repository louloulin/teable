/**
 * Automation Canvas — NestJS auth service (Stage 107).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  addEdge,
  addNode,
  groupNodesByKind,
  moveNode,
  planCanvasExecution,
  removeEdge,
  removeNode,
  resolveNodeRef,
  serializeGraph,
  summarizeCanvas,
  topoSort,
  validateCanvasGraph,
} from './automation-canvas.service';
import {
  CanvasEdgeSpec,
  CanvasExecutionPlan,
  CanvasGraphSpec,
  CanvasNodeSpec,
  CanvasValidationResult,
} from './automation-canvas.types';

@Injectable()
export class AutomationCanvasAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a graph (delegates to pure helper). */
  validate(
    graph: CanvasGraphSpec,
    catalog?: { triggers?: readonly string[]; actions?: readonly string[]; conditions?: readonly string[] }
  ): CanvasValidationResult {
    return validateCanvasGraph(graph, catalog);
  }

  /** Plan execution. */
  plan(graph: CanvasGraphSpec): CanvasExecutionPlan {
    return planCanvasExecution(graph);
  }

  /** Topo sort. */
  topo(graph: CanvasGraphSpec): string[] {
    return topoSort(graph);
  }

  /** Resolve ref against catalog or built-ins. */
  resolveRef(
    kind: CanvasNodeSpec['kind'],
    ref: string,
    catalog?: { triggers?: readonly string[]; actions?: readonly string[]; conditions?: readonly string[] }
  ): boolean {
    return resolveNodeRef(kind, ref, catalog);
  }

  /** Add a node. */
  addNode(graph: CanvasGraphSpec, node: CanvasNodeSpec): CanvasGraphSpec {
    return addNode(graph, node);
  }

  /** Remove a node. */
  removeNode(graph: CanvasGraphSpec, nodeId: string): CanvasGraphSpec {
    return removeNode(graph, nodeId);
  }

  /** Add an edge. */
  addEdge(graph: CanvasGraphSpec, edge: CanvasEdgeSpec): CanvasGraphSpec {
    return addEdge(graph, edge);
  }

  /** Remove an edge. */
  removeEdge(graph: CanvasGraphSpec, edgeId: string): CanvasGraphSpec {
    return removeEdge(graph, edgeId);
  }

  /** Move a node. */
  moveNode(graph: CanvasGraphSpec, nodeId: string, position: { x: number; y: number }): CanvasGraphSpec {
    return moveNode(graph, nodeId, position);
  }

  /** Group nodes by kind. */
  groupByKind(graph: CanvasGraphSpec): Record<string, CanvasNodeSpec[]> {
    return groupNodesByKind(graph);
  }

  /** Summarize. */
  summarize(graph: CanvasGraphSpec) {
    return summarizeCanvas(graph);
  }

  /** Serialize deterministically. */
  serialize(graph: CanvasGraphSpec): string {
    return serializeGraph(graph);
  }

  /** Health probe. */
  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}