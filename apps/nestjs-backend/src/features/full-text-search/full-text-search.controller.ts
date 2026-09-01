/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Full-text search — admin HTTP controller (Round-INFRA-7).
 *
 * Operator-facing search + indexing endpoints for the admin panel:
 *   GET /api/admin/full-text-search/search?q=...&tableId=...&mode=and&limit=20&sort=relevance
 *   GET /api/admin/full-text-search/count?q=...&tableId=...&mode=and
 *   GET /api/admin/full-text-search/index/status?tableId=...
 *
 * All endpoints gated by the `admin_panel` license capability. The free-text
 * `q` parameter is parsed by `parseQueryString` (phrase / negate aware) before
 * being handed to the auth service.
 *
 * License: AGPL-3.0
 */
import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';

import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { FullTextSearchAuthService } from './full-text-search.auth.service';
import { parseQueryString } from './full-text-search.service';
import type { ISearchToken } from './full-text-search.types';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

function buildTokens(q: string | undefined): ISearchToken[] {
  if (!q || q.trim().length === 0) {
    throw new BadRequestException('query parameter `q` is required');
  }
  return parseQueryString(q);
}

@Controller('api/admin/full-text-search')
@UseGuards(AdminGuard)
export class FullTextSearchController {
  constructor(private readonly svc: FullTextSearchAuthService) {}

  @Get('search')
  async search(
    @Query('q') q: string | undefined,
    @Query('tableId') tableId?: string,
    @Query('mode') mode?: string,
    @Query('sort') sort?: string,
    @Query('limit') limitStr?: string
  ) {
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number(limitStr ?? DEFAULT_LIMIT) || DEFAULT_LIMIT));
    const result = await this.svc.search({
      tokens: buildTokens(q),
      mode: mode === 'or' ? 'or' : 'and',
      tableId,
      sort: sort === 'recent' ? 'recent' : 'relevance',
      limit,
    });
    return { tableId: tableId ?? null, total: result.total, hits: result.hits, elapsedMs: result.elapsedMs };
  }

  @Get('count')
  async count(@Query('q') q: string | undefined, @Query('tableId') tableId?: string, @Query('mode') mode?: string) {
    const result = await this.svc.search({
      tokens: buildTokens(q),
      mode: mode === 'or' ? 'or' : 'and',
      tableId,
      limit: MAX_LIMIT,
    });
    return { tableId: tableId ?? null, count: result.total };
  }

  @Get('index/status')
  async indexStatus(@Query('tableId') tableId?: string) {
    return this.svc.indexStatus(tableId);
  }
}
