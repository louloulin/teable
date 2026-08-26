/**
 * Builtin-assets-init — thin-DI wrapper (Stage N).
 *
 * Read-only "are the bootstrap assets uploaded yet?" entry point. Uses a
 * single `count` against the attachments table; the upload itself stays in
 * `BuiltinAssetsInitService`.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { formatAssetId, isAssetInitComplete } from './builtin-assets-init.helpers';
import type { IBuiltinAssetInitStatus } from './builtin-assets-init.types';

const expectedAssetCount = 7;

@Injectable()
export class BuiltinAssetsInitAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lightweight check used by `/health` style probes. */
  async isInitialized(): Promise<IBuiltinAssetInitStatus> {
    const observed = await this.prisma.attachments.count({
      where: { deletedTime: null },
    });
    return {
      initialized: isAssetInitComplete(observed, expectedAssetCount),
      observedCount: observed,
      expectedCount: expectedAssetCount,
    };
  }

  /** Resolve a normalised asset id (used by callers wiring up custom assets). */
  resolveAssetId(rawId: string): string {
    return formatAssetId(rawId);
  }
}
