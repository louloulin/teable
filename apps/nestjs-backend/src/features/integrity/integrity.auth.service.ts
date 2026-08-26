/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Integrity — NestJS thin-DI auth service (Stage N).
 *
 * Auth-only entry point for the integrity feature: cheap, read-only
 * `summarize(tableId)` that aggregates orphan counts from existing
 * indexes. The full scan/repair flow stays in `LinkIntegrityService`.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { summarizeIssues } from './integrity.helpers';
import type { ILinkIntegritySummary } from './integrity.types';

@Injectable()
export class IntegrityAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async summarize(tableId: string): Promise<ILinkIntegritySummary> {
    const rows = await this.prisma.linkIntegrityIssue.findMany({
      where: { tableId },
    });
    return summarizeIssues(
      rows.map((row) => ({
        linkFieldId: row.linkFieldId,
        symmetricFieldId: row.symmetricFieldId,
        orphanCount: row.orphanCount,
      }))
    );
  }
}