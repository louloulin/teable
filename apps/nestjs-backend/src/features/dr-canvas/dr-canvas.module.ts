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
import { DrCanvasAuthService } from './dr-canvas.auth.service';

/**
 * NestJS-injectable wrapper around the pure helper functions exported
 * from `dr-canvas.service.ts`. The underlying helpers are
 * copied verbatim from the supervisor branch — this class only adds a
 * thin DI surface so downstream modules can inject a single service
 * reference.
 */
export class DrCanvasService {
  validateDrCanvas = validateDrCanvas;
  topoSortDr = topoSortDr;
  planDrExecution = planDrExecution;
  addDrNode = addDrNode;
  removeDrNode = removeDrNode;
  addDrEdge = addDrEdge;
  removeDrEdge = removeDrEdge;
  moveDrNode = moveDrNode;
  findDrNodeByCheckpoint = findDrNodeByCheckpoint;
  listDrCheckpoints = listDrCheckpoints;
  serializeDrCanvas = serializeDrCanvas;
  summarizeDrCanvas = summarizeDrCanvas;
}

@Module({
  providers: [DrCanvasService, DrCanvasAuthService],
  exports: [DrCanvasService, DrCanvasAuthService],
})
export class DrCanvasModule {}
