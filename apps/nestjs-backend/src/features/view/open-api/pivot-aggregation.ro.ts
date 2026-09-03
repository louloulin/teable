/**
 * R-View-Pivot — Request object schema for pivot aggregation endpoint.
 *
 * Records are passed inline so the endpoint can remain framework-agnostic
 * (the heavy lifting is pure @teable/core).
 */

import { z } from 'zod';
import { MEASURE_FUNCTIONS } from '@teable/core';

export const pivotAggregateRoSchema = z.object({
  records: z.array(z.record(z.string(), z.unknown())).min(1).max(50000),
  rowFieldId: z.string().min(1),
  columnFieldId: z.string().min(1),
  measureFieldId: z.string().min(1),
  measureFunction: z.enum(MEASURE_FUNCTIONS as unknown as [string, ...string[]]),
  showEmptyGroups: z.boolean().optional(),
});

export type IPivotAggregateRo = z.infer<typeof pivotAggregateRoSchema>;
