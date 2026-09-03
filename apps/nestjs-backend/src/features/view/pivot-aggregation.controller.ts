/**
 * R-View-Pivot — Backend HTTP endpoint (Cloud Business §视图 §透视表).
 *
 * `POST /api/table/:tableId/pivot/aggregate` accepts inline `records` and
 * returns the pivot-aggregated cells. This is intentionally a thin
 * facade — the heavy lifting is done by `computePivot` from `@teable/core`
 * (same function used by the frontend PivotView block).
 *
 * Request body:
 *   {
 *     records: Array<Record<string, unknown>>,
 *     rowFieldId: string,
 *     columnFieldId: string,
 *     measureFieldId: string,
 *     measureFunction: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median',
 *     showEmptyGroups?: boolean
 *   }
 *
 * Returns { rows, columns, cells, totalRecords } where `cells` is a plain
 * object map keyed by `${rowIdx}|${colIdx}`.
 */

import { Body, Controller, Param, Post } from '@nestjs/common';
import { HttpErrorCode, type MeasureFunction } from "@teable/core";
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { CustomHttpException } from '../../custom.exception';
import { PivotAggregationService, type IPivotSerializableResult } from './pivot-aggregation.service';
import {
  type IPivotAggregateRo,
  pivotAggregateRoSchema,
} from './open-api/pivot-aggregation.ro';

@Controller('api/table/:tableId/pivot')
export class PivotAggregationController {
  constructor(private readonly service: PivotAggregationService) {}

  @Post('aggregate')
  async aggregate(
    @Param('tableId') tableId: string,
    @Body(new ZodValidationPipe(pivotAggregateRoSchema)) body: IPivotAggregateRo
  ): Promise<IPivotSerializableResult> {
    try {
      // tableId is reserved for future server-side record fetching;
      // today the client ships the records inline.
      void tableId;
      return this.service.aggregateRecords(body.records, {
        rowFieldId: body.rowFieldId,
        columnFieldId: body.columnFieldId,
        measureFieldId: body.measureFieldId,
        measureFunction: body.measureFunction as MeasureFunction,
        showEmptyGroups: body.showEmptyGroups,
      });
    } catch (err) {
      throw new CustomHttpException(
        `Pivot aggregation failed: ${(err as Error).message}`,
        HttpErrorCode.INTERNAL_SERVER_ERROR
      );
    }
  }
}
