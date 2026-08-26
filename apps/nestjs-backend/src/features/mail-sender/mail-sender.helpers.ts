/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Mail sender — thin-DI wrapper (Stage N).
 *
 * Pure helpers for the mail sender auth surface. No Nest DI, no Prisma
 * — safe to call from anywhere. Consumed by `MailSenderAuthService`.
 */

import type { IMailSenderEnvelope } from './mail-sender.types';

/** Format the wire representation of a single address (name <email>). */
export function formatMailAddress(email: string, name?: string): string {
  const trimmedEmail = email.trim();
  if (!name || !trim()) return trimmedEmail;
  return `${name.trim()} <${trimmedEmail}>`;
}

/** Validate the envelope shape; returns null when valid, else a reason. */
export function validateMailEnvelope(envelope: IMailSenderEnvelope): string | null {
  if (!envelope.from.email?.trim()) return 'missing-from-email';
  if (!envelope.to || envelope.to.length === 0) return 'no-recipients';
  for (const rcpt of envelope.to) {
    if (!rcpt.email?.trim()) return 'empty-recipient-email';
  }
  if (!envelope.subject?.trim()) return 'missing-subject';
  if (!envelope.html?.trim() && !envelope.text?.trim()) return 'missing-body';
  return null;
}