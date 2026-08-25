/**
 * View Metadata Schema — pure helpers (Stage 112).
 */

import {
  MAX_VIEW_COLUMNS,
  MAX_VIEW_COND_FORMATS,
  MAX_VIEW_FILTERS,
  MAX_VIEW_GROUPS,
  MAX_VIEW_SORTS,
  VIEW_NAME_RE,
  ViewColumnSpec,
  ViewCondFormatSpec,
  ViewFilterSpec,
  ViewGroupSpec,
  ViewKind,
  ViewMetadataSpec,
  ViewMetadataValidationIssue,
  ViewMetadataValidationResult,
  ViewSortSpec,
} from './view-metadata-schema.types';

/** Empty metadata factory for a given kind. */
export function emptyViewMetadata(input: { id: string; name: string; kind: ViewKind }): ViewMetadataSpec {
  return {
    id: input.id,
    name: input.name,
    kind: input.kind,
    version: 1,
    options: defaultOptionsFor(input.kind),
    columns: [],
    filters: [],
    sorts: [],
    groups: [],
    condFormats: [],
  };
}

function defaultOptionsFor(kind: ViewKind): Record<string, unknown> {
  switch (kind) {
    case 'grid':
      return { rowHeight: 'medium', freezeColumns: 0 };
    case 'kanban':
      return { coverField: null, stackBy: null };
    case 'gallery':
      return { coverField: null, cardSize: 'medium' };
    case 'calendar':
      return { dateField: null };
    case 'form':
      return { submitButtonLabel: 'Submit' };
    case 'map':
      return { geoField: null };
    case 'timeline':
      return { startField: null, endField: null };
    default:
      return {};
  }
}

/** Validate a view metadata document. */
export function validateViewMetadata(meta: ViewMetadataSpec): ViewMetadataValidationResult {
  const issues: ViewMetadataValidationIssue[] = [];
  if (!meta) {
    issues.push({ field: '*', message: 'metadata missing' });
    return { ok: false, issues };
  }
  if (meta.version !== 1) {
    issues.push({ field: 'version', message: `unsupported version: ${meta.version}` });
  }
  if (!VIEW_NAME_RE.test(meta.name)) {
    issues.push({ field: 'name', message: `invalid name: ${meta.name}` });
  }
  if (meta.columns.length > MAX_VIEW_COLUMNS) {
    issues.push({ field: 'columns', message: `columns ${meta.columns.length} > ${MAX_VIEW_COLUMNS}` });
  }
  if (meta.filters.length > MAX_VIEW_FILTERS) {
    issues.push({ field: 'filters', message: `filters ${meta.filters.length} > ${MAX_VIEW_FILTERS}` });
  }
  if (meta.sorts.length > MAX_VIEW_SORTS) {
    issues.push({ field: 'sorts', message: `sorts ${meta.sorts.length} > ${MAX_VIEW_SORTS}` });
  }
  if (meta.groups.length > MAX_VIEW_GROUPS) {
    issues.push({ field: 'groups', message: `groups ${meta.groups.length} > ${MAX_VIEW_GROUPS}` });
  }
  if (meta.condFormats.length > MAX_VIEW_COND_FORMATS) {
    issues.push({ field: 'condFormats', message: `condFormats ${meta.condFormats.length} > ${MAX_VIEW_COND_FORMATS}` });
  }
  for (const f of meta.filters) {
    if (!f.fieldId) issues.push({ field: `filters.${f.id}`, message: 'filter fieldId required' });
  }
  for (const s of meta.sorts) {
    if (!s.fieldId) issues.push({ field: `sorts.${s.id}`, message: 'sort fieldId required' });
  }
  for (const g of meta.groups) {
    if (!g.fieldId) issues.push({ field: `groups.${g.id}`, message: 'group fieldId required' });
  }
  return { ok: issues.length === 0, issues };
}

/** Add a column. */
export function addColumn(meta: ViewMetadataSpec, col: ViewColumnSpec): ViewMetadataSpec {
  if (meta.columns.some((c) => c.id === col.id)) return meta;
  return { ...meta, columns: [...meta.columns, col] };
}

/** Remove a column. */
export function removeColumn(meta: ViewMetadataSpec, columnId: string): ViewMetadataSpec {
  return {
    ...meta,
    columns: meta.columns.filter((c) => c.id !== columnId),
    filters: meta.filters.filter((f) => f.fieldId !== columnId),
    sorts: meta.sorts.filter((s) => s.fieldId !== columnId),
    groups: meta.groups.filter((g) => g.fieldId !== columnId),
    condFormats: meta.condFormats.filter((c) => c.fieldId !== columnId),
  };
}

/** Reorder columns (move id to a new index). */
export function reorderColumns(meta: ViewMetadataSpec, columnId: string, toIndex: number): ViewMetadataSpec {
  const idx = meta.columns.findIndex((c) => c.id === columnId);
  if (idx < 0) return meta;
  const cols = [...meta.columns];
  const [c] = cols.splice(idx, 1);
  cols.splice(Math.max(0, Math.min(toIndex, cols.length)), 0, c);
  return { ...meta, columns: cols };
}

/** Set column width. */
export function setColumnWidth(meta: ViewMetadataSpec, columnId: string, width: number): ViewMetadataSpec {
  return {
    ...meta,
    columns: meta.columns.map((c) => (c.id === columnId ? { ...c, width: Math.max(20, width) } : c)),
  };
}

/** Toggle column hidden. */
export function toggleColumnHidden(meta: ViewMetadataSpec, columnId: string): ViewMetadataSpec {
  return {
    ...meta,
    columns: meta.columns.map((c) => (c.id === columnId ? { ...c, hidden: !c.hidden } : c)),
  };
}

/** Toggle column pinned. */
export function toggleColumnPinned(meta: ViewMetadataSpec, columnId: string): ViewMetadataSpec {
  return {
    ...meta,
    columns: meta.columns.map((c) => (c.id === columnId ? { ...c, pinned: !c.pinned } : c)),
  };
}

/** Add a filter. */
export function addFilter(meta: ViewMetadataSpec, filter: ViewFilterSpec): ViewMetadataSpec {
  if (meta.filters.some((f) => f.id === filter.id)) return meta;
  return { ...meta, filters: [...meta.filters, filter] };
}

/** Add a sort. */
export function addSort(meta: ViewMetadataSpec, sort: ViewSortSpec): ViewMetadataSpec {
  if (meta.sorts.some((s) => s.id === sort.id)) return meta;
  return { ...meta, sorts: [...meta.sorts, sort] };
}

/** Add a group. */
export function addGroup(meta: ViewMetadataSpec, group: ViewGroupSpec): ViewMetadataSpec {
  if (meta.groups.some((g) => g.id === group.id)) return meta;
  return { ...meta, groups: [...meta.groups, group] };
}

/** Add a conditional format. */
export function addCondFormat(meta: ViewMetadataSpec, cf: ViewCondFormatSpec): ViewMetadataSpec {
  if (meta.condFormats.some((c) => c.id === cf.id)) return meta;
  return { ...meta, condFormats: [...meta.condFormats, cf] };
}

/** List visible columns in order. */
export function listVisibleColumns(meta: ViewMetadataSpec): ViewColumnSpec[] {
  return meta.columns.filter((c) => !c.hidden);
}

/** List pinned columns. */
export function listPinnedColumns(meta: ViewMetadataSpec): ViewColumnSpec[] {
  return meta.columns.filter((c) => c.pinned && !c.hidden);
}

/** Sum of column widths. */
export function totalWidth(meta: ViewMetadataSpec): number {
  return meta.columns.reduce((sum, c) => sum + (c.hidden ? 0 : c.width), 0);
}

/** Serialize deterministically. */
export function serializeViewMetadata(meta: ViewMetadataSpec): string {
  return JSON.stringify(meta);
}

/** Summary stats. */
export function summarizeViewMetadata(meta: ViewMetadataSpec): {
  kind: ViewKind;
  columns: number;
  visibleColumns: number;
  filters: number;
  sorts: number;
  groups: number;
  condFormats: number;
  totalWidth: number;
} {
  return {
    kind: meta.kind,
    columns: meta.columns.length,
    visibleColumns: listVisibleColumns(meta).length,
    filters: meta.filters.length,
    sorts: meta.sorts.length,
    groups: meta.groups.length,
    condFormats: meta.condFormats.length,
    totalWidth: totalWidth(meta),
  };
}

/** Migrate an older document forward (placeholder). */
export function migrateViewMetadata(meta: ViewMetadataSpec): ViewMetadataSpec {
  return { ...meta, version: 1 };
}