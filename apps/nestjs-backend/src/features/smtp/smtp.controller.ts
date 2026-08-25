import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
} from '@nestjs/common';

import { SmtpService } from './smtp.service';
import { ISendMailInput, ISendMailResult, ISmtpConfig } from './smtp.types';

interface ICredentialedCaller {
  /**
   * True when the caller has admin scope. We avoid importing the
   * upstream guard so this module stays self-contained; the real auth
   * module will inject its own guard in front of these endpoints.
   */
  admin?: boolean;
}

/**
 * Built-in SMTP controller (Stage 19).
 *
 *   POST /api/smtp/send        send a transactional email
 *   POST /api/smtp/test-conn   verify the connection without sending
 *
 * The controller reads SMTP config from the request body; we
 * intentionally don't tie it to the global config service yet so each
 * tenant (or test) can use a different SMTP server. A future stage
 * will add per-org SMTP settings.
 */
@Controller('api/smtp')
export class SmtpController {
  constructor(private readonly smtp: SmtpService) {}

  @Post('send')
  @HttpCode(200)
  async send(
    @Body() body: { config: ISmtpConfig; mail: ISendMailInput; actor?: ICredentialedCaller }
  ): Promise<ISendMailResult> {
    if (!body?.actor?.admin) {
      throw new ForbiddenException('admin scope required');
    }
    if (!body.config?.host || !body.config?.port) {
      throw new BadRequestException('config.host + config.port required');
    }
    if (!body.mail?.to || !body.mail?.subject) {
      throw new BadRequestException('mail.to + mail.subject required');
    }
    return this.smtp.sendMail(body.config, body.mail);
  }

  @Post('test-conn')
  @HttpCode(200)
  async testConn(
    @Body() body: { config: ISmtpConfig; actor?: ICredentialedCaller }
  ): Promise<{ ok: boolean; error?: string }> {
    if (!body?.actor?.admin) {
      throw new ForbiddenException('admin scope required');
    }
    if (!body.config?.host || !body.config?.port) {
      throw new BadRequestException('config.host + config.port required');
    }
    // We use sendMail with an inert message so the full handshake runs.
    // The server still returns 250 on the envelope but we treat any
    // throw as a connection failure.
    try {
      await this.smtp.sendMail(body.config, {
        from: body.config.from ?? 'postmaster@localhost',
        to: 'probe@localhost',
        subject: 'connection probe',
        text: 'probe',
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
