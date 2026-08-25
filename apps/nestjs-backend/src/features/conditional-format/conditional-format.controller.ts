import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { ConditionalFormatService } from './conditional-format.service';
import { ICfEvaluationResult, ICfRuleInput, ICfRuleRow } from './conditional-format.types';

/**
 * Conditional formatting controller (Stage 18).
 *
 *   GET    /api/view/:viewId/conditional-format          list rules
 *   POST   /api/view/:viewId/conditional-format          create / update
 *   DELETE /api/view/:viewId/conditional-format/:id      delete rule
 *   POST   /api/view/:viewId/conditional-format/preview  preview styles
 */
@Controller('api/view/:viewId/conditional-format')
export class ConditionalFormatController {
  constructor(private readonly service: ConditionalFormatService) {}

  @Get()
  async list(@Param('viewId') viewId: string): Promise<{ rules: ICfRuleRow[] }> {
    return { rules: await this.service.listByView(viewId) };
  }

  @Post()
  @HttpCode(200)
  async upsert(
    @Param('viewId') viewId: string,
    @Body() body: ICfRuleInput & { id?: string }
  ): Promise<ICfRuleRow> {
    if (!body?.name || !body?.operator || !body?.style) {
      throw new BadRequestException('name, operator, style required');
    }
    return this.service.upsert(viewId, body.id ?? null, body);
  }

  @Delete(':id')
  @HttpCode(200)
  async delete(@Param('id') id: string): Promise<{ deleted: boolean }> {
    return { deleted: await this.service.delete(id) };
  }

  /**
   * Preview the merged styles for a single record. The caller passes
   * the row data; we do not consult the DB for the record itself.
   * This endpoint exists so the rule editor can show a live preview
   * without needing to persist anything.
   */
  @Post('preview')
  @HttpCode(200)
  async preview(
    @Param('viewId') viewId: string,
    @Body() body: { record: Record<string, unknown> }
  ): Promise<ICfEvaluationResult> {
    const rules = await this.service.listByView(viewId);
    return this.service.evaluate(rules, body.record ?? {});
  }

  /**
   * Bulk-evaluate for a list of records. Used by the v2 row-fetch
   * hot path to color a result set in one round-trip.
   */
  @Post('evaluate')
  @HttpCode(200)
  async evaluate(
    @Param('viewId') viewId: string,
    @Body() body: { records: Array<Record<string, unknown>> }
  ): Promise<{ results: ICfEvaluationResult[] }> {
    if (!Array.isArray(body?.records)) {
      throw new BadRequestException('records required');
    }
    const rules = await this.service.listByView(viewId);
    return {
      results: body.records.map((r) => this.service.evaluate(rules, r)),
    };
  }
}
