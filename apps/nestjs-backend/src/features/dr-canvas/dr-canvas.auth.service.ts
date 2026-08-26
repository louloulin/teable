/**
 * DR Canvas — NestJS auth service (Stage 111).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  addDrEdge,
  addDrNode,
  findDrNodeByCheckpoint,
  listDrCheckpoints,
  moveDrNode,
  planDrExecution,
  removeDrEdge,
  removeDrNode,
  serializeDrCanvas,
  summarizeDrCanvas,
  topoSortDr,
  validateDrCanvas,
} from './dr-canvas.service';
import {
  DrCanvasSpec,
  DrEdgeSpec,
  DrExecutionPlan,
  DrNodeSpec,
  DrValidationResult,
} from './dr-canvas.types';

@Injectable()
export class DrCanvasAuthService {
  constructor(private readonly prisma: PrismaService) {}

  validate(canvas: DrCanvasSpec, catalog?: Record<string, readonly string[]>): DrValidationResult {
    return validateDrCanvas(canvas, catalog);
  }

  plan(canvas: DrCanvasSpec): DrExecutionPlan {
    return planDrExecution(canvas);
  }

  topo(canvas: DrCanvasSpec): string[] {
    return topoSortDr(canvas);
  }

  addNode(canvas: DrCanvasSpec, node: DrNodeSpec): DrCanvasSpec {
    return addDrNode(canvas, node);
  }

  removeNode(canvas: DrCanvasSpec, id: string): DrCanvasSpec {
    return removeDrNode(canvas, id);
  }

  addEdge(canvas: DrCanvasSpec, edge: DrEdgeSpec): DrCanvasSpec {
    return addDrEdge(canvas, edge);
  }

  removeEdge(canvas: DrCanvasSpec, edgeId: string): DrCanvasSpec {
    return removeDrEdge(canvas, edgeId);
  }

  moveNode(canvas: DrCanvasSpec, id: string, pos: { x: number; y: number }): DrCanvasSpec {
    return moveDrNode(canvas, id, pos);
  }

  findByCheckpoint(canvas: DrCanvasSpec, checkpointId: string): DrNodeSpec | undefined {
    return findDrNodeByCheckpoint(canvas, checkpointId);
  }

  listCheckpoints(canvas: DrCanvasSpec) {
    return listDrCheckpoints(canvas);
  }

  serialize(canvas: DrCanvasSpec): string {
    return serializeDrCanvas(canvas);
  }

  summarize(canvas: DrCanvasSpec) {
    return summarizeDrCanvas(canvas);
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
