import { Module } from '@nestjs/common';

import { SmtpController } from './smtp.controller';
import { SmtpService } from './smtp.service';

/**
 * Built-in SMTP module — Stage 19.
 *
 * Provides a self-contained SMTP client that automation rules (and
 * any other in-process caller) can use to send transactional email
 * without depending on an external service. The wire-level client is
 * pure-Node (net/tls + crypto), which means there are no new runtime
 * dependencies — we deliberately avoid nodemailer to keep the OSS
 * dependency surface small.
 *
 * Per-org SMTP credentials are not modeled in this stage; the
 * controller accepts the config inline so that the next stage can
 * introduce per-organization SMTP settings without breaking callers.
 */
@Module({
  controllers: [SmtpController],
  providers: [SmtpService],
  exports: [SmtpService],
})
export class SmtpModule {}
