/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Feishu event subscription endpoint.
 *
 * Feishu requires a public URL for `url_verification` and event delivery.
 * This controller deliberately keeps inbound handling small and safe: it
 * verifies the configured token/signature and acknowledges the event.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Optional,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@teable/db-main-prisma';
import type { Request } from 'express';

import { Public } from '../auth/decorators/public.decorator';
import { FeishuConfigService } from './feishu-config.service';
import { verifyFeishuEventSignature } from './feishu.adapter';

interface IFeishuEventBody {
  type?: string;
  token?: string;
  challenge?: string;
  header?: { event_type?: string; event_id?: string };
  event?: Record<string, unknown>;
}

@Controller('api/im-bridge/feishu/events')
export class FeishuWebhookController {
  constructor(
    private readonly feishuConfig: FeishuConfigService,
    private readonly prisma: PrismaService,
    @Optional() private readonly events?: EventEmitter2
  ) {}

  @Public()
  @Post(':spaceId')
  @HttpCode(200)
  // eslint-disable-next-line sonarjs/cognitive-complexity
  async receive(
    @Param('spaceId') spaceId: string,
    @Body() body: IFeishuEventBody,
    @Req() request: Request,
    @Headers('x-lark-request-timestamp') timestamp?: string,
    @Headers('x-lark-request-nonce') nonce?: string,
    @Headers('x-lark-signature') signature?: string
  ) {
    const config = await this.feishuConfig.getDecryptedConfig(spaceId);
    if (!config) throw new UnauthorizedException('no Feishu config for this space');

    if (body?.type === 'url_verification') {
      if (!body.token || body.token !== config.verificationToken) {
        throw new UnauthorizedException('invalid Feishu verification token');
      }
      if (!body.challenge) throw new BadRequestException('challenge is required');
      return { challenge: body.challenge };
    }

    const rawBody = this.getRawBody(request, body);
    const verification = verifyFeishuEventSignature({
      timestamp,
      nonce,
      signature,
      encryptKey: config.encryptKey,
      rawBody,
    });
    if (!verification.ok) throw new UnauthorizedException(verification.error);

    const eventId = body.header?.['event_id'];
    if (!eventId) throw new BadRequestException('Feishu event_id is required');
    const externalEventId = `feishu:${spaceId}:${eventId}`;
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { externalEventId },
    });
    if (existing) {
      return {
        ok: true,
        eventId,
        eventType: body.header?.['event_type'] ?? null,
        accepted: true,
        deduplicated: true,
      };
    }
    const receivedAt = new Date();
    try {
      await this.prisma.webhookEvent.create({
        data: {
          id: `feishu_${spaceId}_${eventId}`,
          externalEventId,
          eventType: body.header?.['event_type'] ?? 'unknown',
          receivedAt,
          payloadJson: rawBody,
          processedAt: receivedAt,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      return {
        ok: true,
        eventId,
        eventType: body.header?.['event_type'] ?? null,
        accepted: true,
        deduplicated: true,
      };
    }

    if (body.header?.['event_type'] === 'im.message.receive_v1' && body.event) {
      this.events?.emit('im.feishu.message', {
        spaceId,
        eventId,
        eventType: body.header['event_type'],
        event: body.event,
      });
    }

    return {
      ok: true,
      eventId,
      eventType: body.header?.['event_type'] ?? null,
      accepted: true,
      deduplicated: false,
    };
  }

  private getRawBody(request: Request, body: IFeishuEventBody): string {
    const rawBody = (request as Request & { rawBody?: Buffer | string }).rawBody;
    if (typeof rawBody === 'string') return rawBody;
    if (rawBody instanceof Buffer) return rawBody.toString('utf8');
    return JSON.stringify(body ?? {});
  }
}
