/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Invitation — thin-DI wrapper (Stage N).
 *
 * Minimal types for the invitation auth surface. The full invite
 * lifecycle (create / accept / decline) stays in `invitation.service.ts`;
 * this module only declares the shapes needed by `InvitationAuthService`.
 */

export interface IInvitationRecord {
  id: string;
  spaceId: string;
  email: string;
  role: string;
  invitedBy: string;
  expiredTime: Date | null;
}

export interface IValidatedInvitation {
  invitationId: string;
  spaceId: string;
  email: string;
  role: string;
  expiredTime: string | null;
}