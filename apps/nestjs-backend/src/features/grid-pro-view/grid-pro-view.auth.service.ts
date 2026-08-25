/**
 * Grid Pro View — NestJS auth service (Stage 116).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildSpec,
  columnSummary,
  findCell,
  renderGridPro,
  scrollOffsetForRow,
  withinRowCap,
  windowCells,
} from './grid-pro-view.service';
import {
  GridProCellData,
  GridProCellRender,
  GridProRenderResult,
  GridProViewSpec,
} from './grid-pro-view.types';
import { FormatRule } from '../view-conditional-format-engine/view-conditional-format-engine.types';
import { ViewMetadataSpec } from '../view-metadata-schema/view-metadata-schema.types';
import { ViewportSpec } from '../view-layout-engine/view-layout-engine.types';

@Injectable()
export class GridProViewAuthService {
  constructor(private readonly prisma: PrismaService) {}

  render(spec: GridProViewSpec, cells: readonly GridProCellData[]): GridProRenderResult {
    return renderGridPro(spec, cells);
  }

  scroll(spec: GridProViewSpec, rowIndex: number): number {
    return scrollOffsetForRow(spec, rowIndex);
  }

  window(render: GridProRenderResult, scrollY: number, viewportHeight: number): GridProCellRender[] {
    return windowCells(render, scrollY, viewportHeight);
  }

  withinCap(spec: GridProViewSpec): boolean {
    return withinRowCap(spec);
  }

  summary(spec: GridProViewSpec): { visible: number; total: number } {
    return columnSummary(spec);
  }

  find(cells: readonly GridProCellRender[], rowId: string, fieldId: string): GridProCellRender | null {
    return findCell(cells, rowId, fieldId);
  }

  build(input: { viewId: string; meta: ViewMetadataSpec; rows: readonly string[]; condFormatRules?: readonly FormatRule[]; viewport?: ViewportSpec }): GridProViewSpec {
    return buildSpec(input);
  }

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}