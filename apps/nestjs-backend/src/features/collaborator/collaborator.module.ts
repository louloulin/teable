import { Module } from '@nestjs/common';
import { CollaboratorController } from './collaborator.controller';
import { CollaboratorAuthService } from './collaborator.auth.service';
import { CollaboratorService } from './collaborator.service';

/**
 * Collaborator module — thin-DI wrapper (Stage N).
 *
 * Carries the existing controller/service as-is and adds a single
 * `CollaboratorAuthService` so callers can resolve a user's role on a
 * space without pulling in the full collaborator service surface.
 */
@Module({
  providers: [CollaboratorService, CollaboratorAuthService],
  controllers: [CollaboratorController],
  exports: [CollaboratorService, CollaboratorAuthService],
})
export class CollaboratorModule {}
