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
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import type { IClsStore } from '../../types/cls';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { WebhookDeliveryAuthService } from './webhook-delivery.auth.service';

const deliveryIdParamSchema = z.object({
  id: z.string().uuid(),
});

const deliveryIdPipe = new ZodValidationPipe(deliveryIdParamSchema);

@Controller('api/admin/webhook')
export class WebhookDeliveryAdminController {
  constructor(
    private readonly auth: WebhookDeliveryAuthService,
    private readonly cls: ClsService<IClsStore>
  ) {}

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