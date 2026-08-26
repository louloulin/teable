/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Mail sender — thin-DI wrapper (Stage N).
 *
 * Minimal types for the mail sender auth surface. The full SMTP/queue
 * flow stays in `mail-sender.service.ts`; this module only declares the
 * shapes needed by `MailSenderAuthService`.
 */

export interface IMailSenderAddress {
  email: string;
  name?: string;
}

export interface IMailSenderEnvelope {
  from: IMailSenderAddress;
  to: readonly IMailSenderAddress[];
  subject: string;
  /** Pre-rendered HTML body. */
  html: string;
  /** Optional plain-text alternative. */
  text?: string;
}