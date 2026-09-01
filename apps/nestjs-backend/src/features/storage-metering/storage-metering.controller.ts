/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Storage metering — admin HTTP controller (Round-INFRA-2).
 *
 * Read-only admin endpoints exposing per-base storage attribution:
 *   GET /api/admin/storage-metering/attribution?orgId=...&baseId=...
 *   GET /api/admin/storage-metering/org/:orgId/billable
 *   GET /api/admin/storage-metering/kinds
 *
 * All endpoints are gated by the `admin_panel` license capability.
 * Mutations (recordSample, persistLine) remain on the auth service and
 * are invoked from internal feature modules.
 *
 * License: AGPL-3.0
 */
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { StorageMeteringAuthService } from './storage-metering.auth.service';
import type { IStorageAttribution, IStorageBillableLine } from './storage-metering.types';
import { STORAGE_KINDS } from './storage-metering.types';

const StorageMeteringGuard = LicenseCapabilityGuard.for('admin_panel');

const attributionQuerySchema = z.object({
  orgId: z.string().trim().min(1).max(100),
  baseId: z.string().trim().min(1).max(100),
});

@Controller('api/admin/storage-metering')
@UseGuards(StorageMeteringGuard)
export class StorageMeteringController {
  constructor(private readonly svc: StorageMeteringAuthService) {}

  @Get('attribution')
  async attribution(
    @Query(new ZodValidationPipe(attributionQuerySchema)) q: z.infer<typeof attributionQuerySchema>
  ): Promise<IStorageAttribution> {
    return this.svc.computeAttribution({ orgId: q.orgId, baseId: q.baseId });
  }

  @Get('org/:orgId/billable')
  async billableForOrg(@Param('orgId') orgId: string): Promise<IStorageBillableLine[]> {
    return this.svc.billableForOrg(orgId);
  }

  @Get('kinds')
  async kinds(): Promise<{ kinds: ReadonlyArray<string> }> {
    return { kinds: STORAGE_KINDS };
  }
}
