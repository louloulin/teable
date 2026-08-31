import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { ConflictReplayAuthService } from './conflict-replay.auth.service';
import { ConflictReplayController } from './conflict-replay.controller';

/**
 * Round-31: Conflict replay NestJS module.
 *
 * Wires ConflictReplayAuthService (enqueueConflict + drainQueue) to HTTP via
 * ConflictReplayController. The pure helpers in conflict-replay.service.ts
 * (validateEvent, enqueue, canRetry, markAttempt, replay, drain, toAttempt)
 * are consumed exclusively by the auth service.
 *
 * Registers 5 endpoints worth of routes:
 *   - POST /events                              enqueue
 *   - GET  /orgs/:orgId/queue                   list
 *   - GET  /orgs/:orgId/events/:id              load
 *   - DELETE /orgs/:orgId/events/:id            drop (cleanup)
 *   - POST /orgs/:orgId/drain                   drain with replay applier
 */
@Module({
  imports: [PrismaModule],
  controllers: [ConflictReplayController],
  providers: [ConflictReplayAuthService],
  exports: [ConflictReplayAuthService],
})
export class ConflictReplayModule {}
