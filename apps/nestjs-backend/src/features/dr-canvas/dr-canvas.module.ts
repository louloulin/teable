import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { DrCanvasAuthService } from './dr-canvas.auth.service';
import { DrCanvasController } from './dr-canvas.controller';

/**
 * Round-33: DR canvas NestJS module.
 *
 * Wires DrCanvasAuthService to the HTTP layer via DrCanvasController.
 * The auth service now exposes both in-memory graph helpers (validate,
 * plan, topoSort, addNode, addEdge, removeNode, removeEdge, moveNode,
 * findByCheckpoint, listCheckpoints, serialize, summarize) and the
 * four new persistence methods (upsert/load/list/delete).
 *
 * Registers 6 endpoints worth of routes covering both persisted CRUD
 * and pure-graph operations.
 */
@Module({
  imports: [PrismaModule],
  controllers: [DrCanvasController],
  providers: [DrCanvasAuthService],
  exports: [DrCanvasAuthService],
})
export class DrCanvasModule {}
