import { Module } from '@nestjs/common';

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

/**
 * Pure-function helpers for DR canvas — no Nest DI surface, consumed directly
 * by callers. Wave 6 surfaces that the previous thin-DI wrapper class was
 * never @Injectable() and could not be wired; we removed it.
 */
export const DrCanvasService = {
  validateDrCanvas,
  topoSortDr,
  planDrExecution,
  addDrNode,
  removeDrNode,
  addDrEdge,
  removeDrEdge,
  moveDrNode,
  findDrNodeByCheckpoint,
  listDrCheckpoints,
  serializeDrCanvas,
  summarizeDrCanvas,
};

@Module({})
export class DrCanvasModule {}
