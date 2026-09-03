import type { IGridColumnMeta } from '../column-meta.schema';
import type { ViewType } from '../constant';
import { ViewCore } from '../view';
import type { IViewVo } from '../view.schema';
import type { IPivotViewOptions } from './pivot-view-option.schema';

/**
 * R-View-Pivot — Pivot view DTO ( Cloud Business §视图 §透视表).
 *
 * The pivot view is a grid-style view that aggregates records by row/column
 * dimensions with a summary measure (sum/avg/count/min/max/median). Backend
 * exposes the option schema (see pivot-view-option.schema.ts); the
 * aggregation pipeline itself ships in a follow-up stage.
 *
 * columnMeta reuses IGridColumnMeta shape so we don't fork column-metadata
 * machinery. Row dimensions + measure slots live inside `options`.
 */
export interface IPivotView extends IViewVo {
  type: ViewType.Pivot;
  options: IPivotViewOptions;
}

export class PivotViewCore extends ViewCore {
  type!: ViewType.Pivot;

  options!: IPivotViewOptions;

  columnMeta!: IGridColumnMeta;
}
