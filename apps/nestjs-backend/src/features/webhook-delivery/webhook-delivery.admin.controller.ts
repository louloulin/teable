/**
 * Webhook delivery admin controller (Wave 10 / T-13).
 *
 * Exposes the "retry a dead-letter delivery" endpoint that the admin
 * dead-letter panel calls. Sits at:
 *
 *     POST /api/admin/webhook/delivery/:id/retry
 *
 * Gated by `instance|update` so only instance admins can re-queue a
 * previously-failed webhook (the global `PermissionGuard` translates
 * that into the `isAdmin` check — see `instancePermissionChecker`).
 *
 * `:id` is validated as a UUID via `ZodValidationPipe` so a malformed
 * value never reaches the service layer.
 */
import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import type { IClsStore } from '../../types/cls';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { WebhookDeliveryAuthService } from './webhook-delivery.auth.service';

const deliveryIdParamSchema = z.object({
  id: z.string().uuid(),
});

const deliveryIdPipe = new ZodValidationPipe(deliveryIdParamSchema);
const WebhookDeliveryGuard = LicenseCapabilityGuard.for('webhook');

@Controller('api/admin/webhook')
@UseGuards(WebhookDeliveryGuard)
export class WebhookDeliveryAdminController {
  constructor(
    private readonly auth: WebhookDeliveryAuthService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @Get('delivery/dead-letter')
  @Permissions('instance|read')
  async listDeadLetter(): Promise<{
    rows: Array<{
      id: string;
      endpointId: string;
      payloadId: string;
      status: string;
      attempt: number;
      maxAttempts: number;
      lastStatusCode?: number;
      lastError?: string;
      finalizedAt?: string;
      createdTime: string;
    }>;
    total: number;
  }> {
    const rows = await this.auth.listDead();
    const result = rows.map((row) => ({
      id: row.id,
      endpointId: row.endpointId,
      payloadId: row.payloadId,
      status: row.status,
      attempt: row.attempt,
      maxAttempts: row.maxAttempts,
      ...(row.lastStatusCode === undefined ? {} : { lastStatusCode: row.lastStatusCode }),
      ...(row.lastError === undefined ? {} : { lastError: row.lastError }),
      ...(row.finalizedAt ? { finalizedAt: row.finalizedAt.toISOString() } : {}),
      createdTime: row.createdTime.toISOString(),
    }));
    return { rows: result, total: result.length };
  }

  /**
   * Re-queue a dead-letter delivery. Returns `{ retried, attemptId }`
   * mirroring `WebhookDeliveryAuthService.retry()`. The fresh row's id
   * is what the panel needs to surface in the success toast.
   *
   * Errors:
   *   - `400` — the delivery exists but is not in `dead` status
   *     (`retry()` throws /not in dead-letter/, we translate it).
   *   - `404` — no row with the given id (`retry()` throws /not found/).
   */
  @Post('delivery/:id/retry')
  @Permissions('instance|update')
  async retry(
    @Param('id', deliveryIdPipe) params: { id: string }
  ): Promise<{ retried: boolean; attemptId: string }> {
    const requesterId = this.cls.get('user')?.id ?? 'system';
    try {
      return await this.auth.retry(params.id, requesterId);
    } catch (err) {
      throw this.translate(err);
    }
  }

  private translate(err: unknown): Error {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found/.test(msg)) return new NotFoundException(msg);
    if (/dead-letter/.test(msg)) return new BadRequestException(msg);
    return err as Error;
  }
}
