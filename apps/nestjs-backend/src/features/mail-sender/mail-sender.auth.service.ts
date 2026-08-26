/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Mail sender — NestJS thin-DI auth service (Stage N).
 *
 * Auth-only entry point for the mail sender feature: validates an
 * envelope shape and returns the canonical sender from-address. The full
 * SMTP/queue flow stays in `MailSenderService`.
 */

import { Injectable } from '@nestjs/common';

import { validateMailEnvelope } from './mail-sender.helpers';
import type { IMailSenderEnvelope } from './mail-sender.types';

@Injectable()
export class MailSenderAuthService {
  /**
   * Validate the envelope shape. Returns null when valid; otherwise a
   * short reason string suitable for surfacing to a caller. Pure —
   * never touches the queue.
   */
  validate(envelope: IMailSenderEnvelope): string | null {
    return validateMailEnvelope(envelope);
  }
}