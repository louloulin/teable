import { Module } from '@nestjs/common';

import { MailSenderAuthService } from './mail-sender.auth.service';
import { MailSenderService } from './mail-sender.service';

/**
 * Mail-sender module — thin-DI wrapper (Stage N).
 *
 * Carries the existing service as-is and adds the auth-only surface
 * (`MailSenderAuthService`) so callers can validate envelopes without
 * pulling in the full SMTP/queue graph.
 */
@Module({
  providers: [MailSenderService, MailSenderAuthService],
  exports: [MailSenderService, MailSenderAuthService],
})
export class MailSenderModule {}