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

  /** Persist a DR canvas (upsert). R33 HTTP-layer add. */
  async upsertCanvas(input: {
    id: string;
    baseId: string;
    name: string;
    canvas: DrCanvasSpec;
    sourceRegion: string;
    destRegion: string;
    createdBy: string;
  }): Promise<DrCanvasSpec> {
    const json = serializeDrCanvas(input.canvas);
    const hash = simpleHash(json);
    await this.prisma.drCanvas.upsert({
      where: { id: input.id },
      create: {
        id: input.id,
        baseId: input.baseId,
        name: input.name,
        canvasJson: input.canvas as unknown as object,
        sourceRegion: input.sourceRegion,
        destRegion: input.destRegion,
        version: 1,
        hash,
        createdBy: input.createdBy,
      },
      update: {
        name: input.name,
        canvasJson: input.canvas as unknown as object,
        sourceRegion: input.sourceRegion,
        destRegion: input.destRegion,
        version: 1,
        hash,
      },
    });
    return input.canvas;
  }

  /** Load a DR canvas by id. */
  async loadCanvas(id: string): Promise<DrCanvasSpec | null> {
    const row = await this.prisma.drCanvas.findUnique({ where: { id } });
    if (!row) return null;
    return row['canvasJson'] as unknown as DrCanvasSpec;
  }

  /** List DR canvases for a base (returns metadata, not full canvas JSON). */
  async listCanvases(
    baseId: string
  ): Promise<
    Array<{
      id: string;
      name: string;
      sourceRegion: string;
      destRegion: string;
      updatedAt: string | null;
    }>
  > {
    const rows = await this.prisma.drCanvas.findMany({ where: { baseId } });
    return rows.map((r: Record<string, unknown>) => ({
      id: String(r['id']),
      name: String(r['name']),
      sourceRegion: String(r['sourceRegion']),
      destRegion: String(r['destRegion']),
      updatedAt: r['updatedAt'] ? new Date(String(r['updatedAt'])).toISOString() : null,
    }));
  }

  /** Delete a DR canvas by id. */
  async deleteCanvas(id: string): Promise<void> {
    await this.prisma.drCanvas.delete({ where: { id } });
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

/** Cheap FNV-1a 32-bit hex hash for optimistic-concurrency on canvas content. */
function simpleHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
