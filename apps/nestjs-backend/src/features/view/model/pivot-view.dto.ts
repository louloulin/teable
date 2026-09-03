import type { IShareViewMeta } from '@teable/core';
import { PivotViewCore } from '@teable/core';

/**
 * R-View-Pivot — Pivot view DTO ( Cloud Business §视图 §透视表).
 *
 * Backend wire-up: extends PivotViewCore from @teable/core and adds
 * defaultShareMeta. Aggregation logic itself lives in a follow-up stage.
 */
export class PivotViewDto extends PivotViewCore {
  defaultShareMeta: IShareViewMeta = {
    includeRecords: false,
  };
}
