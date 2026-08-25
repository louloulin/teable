/**
 * View Metadata Schema — types (Stage 112).
 *
 * Unified schema covering all view types (grid / kanban / gallery / calendar /
 * form / map / timeline). Replaces ad-hoc per-view metadata with a single
 * versioned document.
 */

export type ViewKind = 'grid' | 'kanban' | 'gallery' | 'calendar' | 'form' | 'map' | 'timeline';

export type ViewLayoutDirection = 'row' | 'column';

export interface ViewColumnSpec {
  /** Column id (matches field id). */
  id: string;
  /** Display label override. */
  label?: string;
  /** Pixel width. */
  width: number;
  /** Whether the column is pinned to the left. */
  pinned?: boolean;
  /** Whether the column is hidden from the view. */
  hidden?: boolean;
  /** Per-column formatter override (cell renderer). */
  formatter?: string;
}

export interface ViewFilterSpec {
  id: string;
  fieldId: string;
  op: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'in' | 'is_empty' | 'is_not_empty';
  value?: unknown;
  conjunction?: 'and' | 'or';
}

export interface ViewSortSpec {
  id: string;
  fieldId: string;
  direction: 'asc' | 'desc';
}

export interface ViewGroupSpec {
  id: string;
  fieldId: string;
  /** Hidden groups (when not null). */
  hiddenValues?: readonly string[];
}

export interface ViewCondFormatSpec {
  id: string;
  fieldId: string;
  op: 'equals' | 'gt' | 'lt' | 'between';
  /** Either a single value or [min, max] for between. */
  value: unknown;
  /** Visualization: bar / color / icon. */
  visualization: 'bar' | 'color' | 'icon';
  /** Color / icon name. */
  style?: string;
}

export interface ViewMetadataSpec {
  /** View id. */
  id: string;
  /** Display name. */
  name: string;
  /** View kind. */
  kind: ViewKind;
  /** Schema version. */
  version: 1;
  /** Per-kind extra options (e.g. card cover field for kanban). */
  options: Record<string, unknown>;
  /** Column list (order matters). */
  columns: ViewColumnSpec[];
  /** Filter list. */
  filters: ViewFilterSpec[];
  /** Sort list (applied in order). */
  sorts: ViewSortSpec[];
  /** Group-by list. */
  groups: ViewGroupSpec[];
  /** Conditional format list. */
  condFormats: ViewCondFormatSpec[];
}

export interface ViewMetadataValidationIssue {
  field: string;
  message: string;
}

export interface ViewMetadataValidationResult {
  ok: boolean;
  issues: ViewMetadataValidationIssue[];
}

export const MAX_VIEW_COLUMNS = 200;
export const MAX_VIEW_FILTERS = 64;
export const MAX_VIEW_SORTS = 32;
export const MAX_VIEW_GROUPS = 8;
export const MAX_VIEW_COND_FORMATS = 64;
export const VIEW_NAME_RE = /^[\w\s\-\.\(\)一-龥]{1,80}$/;