/**
 * Collaborator — thin-DI wrapper (Stage N).
 *
 * Minimal types for the collaborator auth surface. The full CRUD flow
 * (createSpaceCollaborator, deleteCollaborator, etc.) remains in
 * `collaborator.service.ts`; this module only declares the summary shape
 * needed by `CollaboratorAuthService.getCollaboratorSummary`.
 */

export type CollaboratorRoleLabel = 'owner' | 'admin' | 'editor' | 'viewer' | 'commenter' | 'no-access';

export interface ICollaboratorSummary {
  resourceId: string;
  resourceType: string;
  principalId: string;
  principalType: string;
  roleName: string;
  label: CollaboratorRoleLabel;
  /** Stable rank for "can this principal manage that one?" comparisons. */
  rank: number;
  createdTime: Date;
}

export type CollaboratorAction = 'create' | 'update' | 'delete' | 'invite';
