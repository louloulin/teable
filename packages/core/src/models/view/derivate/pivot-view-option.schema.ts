import { z } from '../../../zod';

/**
 * R-View-Pivot — Pivot view options schema (Cloud Business §视图 §透视表).
 *
 * Pivot views aggregate records by rows + columns with summary functions
 * (sum / avg / count / min / max / median). Pure option-shape — the
 * aggregation pipeline itself lives in @teable/core/src/models/view/pivot.ts
 * and is consumed by the front-end pivot block.
 *
 * Options are intentionally minimal so we can ship the scaffold without
 * blocking on backend aggregation. Future stages will extend `measures`,
 * `dimensions`, `filters`, and `sorts`.
 */
export const pivotViewOptionSchema = z
  .object({
    /** Field id whose values form the pivot row dimension. */
    rowFieldId: z
      .string()
      .optional()
      .meta({ description: 'Field id used for pivot row dimension' }),
    /** Field id whose values form the pivot column dimension. */
    columnFieldId: z
      .string()
      .optional()
      .meta({ description: 'Field id used for pivot column dimension' }),
    /** Field id + aggregation function for the value cells. */
    measureFieldId: z
      .string()
      .optional()
      .meta({ description: 'Field id whose values are aggregated' }),
    measureFunction: z
      .enum(['sum', 'avg', 'count', 'min', 'max', 'median'])
      .optional()
      .meta({ description: 'Aggregation function for measure cells' }),
    showEmptyGroups: z
      .boolean()
      .optional()
      .meta({ description: 'Whether to render empty row/column groups' }),
  })
  .strict();

export type IPivotViewOptions = z.infer<typeof pivotViewOptionSchema>;
