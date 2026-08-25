/**
 * View Config Panel API — pure helpers (Stage 115).
 */

import {
  ViewCondFormatSpec,
  ViewFilterSpec,
  ViewGroupSpec,
  ViewMetadataSpec,
  ViewSortSpec,
} from '../view-metadata-schema/view-metadata-schema.types';
import {
  ViewConfigPanelColumnSection,
  ViewConfigPanelCondFormatSection,
  ViewConfigPanelFilterSection,
  ViewConfigPanelGroupSection,
  ViewConfigPanelPatchResponse,
  ViewConfigPanelRequest,
  ViewConfigPanelResponse,
  ViewConfigPanelSection,
  ViewConfigPanelSortSection,
} from './view-config-panel-api.types';

/** Build a panel response from a metadata document. */
export function buildPanelResponse(input: ViewConfigPanelRequest, meta: ViewMetadataSpec, canEdit: boolean): ViewConfigPanelResponse {
  return {
    viewId: input.viewId,
    kind: meta.kind,
    name: meta.name,
    canEdit,
    sections: buildSections(meta),
  };
}

function buildSections(meta: ViewMetadataSpec): ViewConfigPanelSection[] {
  const out: ViewConfigPanelSection[] = [];
  out.push({
    kind: 'columns',
    columns: meta.columns.map((c) => ({ id: c.id, width: c.width, hidden: !!c.hidden, pinned: !!c.pinned, label: c.label })),
  });
  out.push({
    kind: 'filters',
    filters: meta.filters.map((f) => ({ id: f.id, fieldId: f.fieldId, op: f.op, value: f.value })),
  });
  out.push({
    kind: 'sorts',
    sorts: meta.sorts.map((s) => ({ id: s.id, fieldId: s.fieldId, direction: s.direction })),
  });
  out.push({
    kind: 'groups',
    groups: meta.groups.map((g) => ({ id: g.id, fieldId: g.fieldId, hiddenValues: g.hiddenValues })),
  });
  out.push({
    kind: 'condFormats',
    condFormats: meta.condFormats.map((c) => ({
      id: c.id, fieldId: c.fieldId, op: c.op, value: c.value, visualization: c.visualization, style: c.style,
    })),
  });
  return out;
}

/** Hash a metadata doc with a stable algorithm. */
export function hashMetadata(meta: ViewMetadataSpec): string {
  // simple stable hash (no node:crypto here to keep pure); same length for reproducibility
  const json = JSON.stringify(meta);
  let h = 0;
  for (let i = 0; i < json.length; i++) h = (h * 31 + json.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).padStart(8, '0');
}

/** Apply patches to a metadata doc, returning the new doc + applied count. */
export function applyPatches(meta: ViewMetadataSpec, patches: readonly ViewConfigPanelSection[]): { metadata: ViewMetadataSpec; applied: number } {
  let m = meta;
  let applied = 0;
  for (const p of patches) {
    const next = applyPatch(m, p);
    if (next !== m) applied++;
    m = next;
  }
  return { metadata: m, applied };
}

function applyPatch(meta: ViewMetadataSpec, patch: ViewConfigPanelSection): ViewMetadataSpec {
  switch (patch.kind) {
    case 'columns':
      return applyColumnPatch(meta, patch);
    case 'filters':
      return { ...meta, filters: patch.filters.map(toFilterSpec) };
    case 'sorts':
      return { ...meta, sorts: patch.sorts.map(toSortSpec) };
    case 'groups':
      return { ...meta, groups: patch.groups.map(toGroupSpec) };
    case 'condFormats':
      return { ...meta, condFormats: patch.condFormats.map(toCondFormatSpec) };
    default:
      return meta;
  }
}

function applyColumnPatch(meta: ViewMetadataSpec, patch: ViewConfigPanelColumnSection): ViewMetadataSpec {
  const cols = patch.columns.map((c) => {
    const cur = meta.columns.find((x) => x.id === c.id);
    return {
      id: c.id,
      width: c.width,
      hidden: c.hidden,
      pinned: c.pinned,
      label: c.label ?? cur?.label,
      formatter: cur?.formatter,
    };
  });
  return { ...meta, columns: cols };
}

function toFilterSpec(f: ViewConfigPanelFilterSection['filters'][number]): ViewFilterSpec {
  return { id: f.id, fieldId: f.fieldId, op: f.op as ViewFilterSpec['op'], value: f.value };
}
function toSortSpec(s: ViewConfigPanelSortSection['sorts'][number]): ViewSortSpec {
  return { id: s.id, fieldId: s.fieldId, direction: s.direction };
}
function toGroupSpec(g: ViewConfigPanelGroupSection['groups'][number]): ViewGroupSpec {
  return { id: g.id, fieldId: g.fieldId, hiddenValues: g.hiddenValues };
}
function toCondFormatSpec(c: ViewConfigPanelCondFormatSection['condFormats'][number]): ViewCondFormatSpec {
  return {
    id: c.id, fieldId: c.fieldId,
    op: c.op as ViewCondFormatSpec['op'],
    value: c.value,
    visualization: c.visualization as ViewCondFormatSpec['visualization'],
    style: c.style,
  };
}

/** Apply a full patch request: validates baseHash + returns a response. */
export function processPatchRequest(
  meta: ViewMetadataSpec,
  baseHash: string,
  patches: readonly ViewConfigPanelSection[],
): { ok: true; response: ViewConfigPanelPatchResponse } | { ok: false; reason: 'conflict' } {
  const currentHash = hashMetadata(meta);
  if (currentHash !== baseHash) return { ok: false, reason: 'conflict' };
  const { metadata, applied } = applyPatches(meta, patches);
  return {
    ok: true,
    response: {
      viewId: meta.id,
      applied,
      hash: hashMetadata(metadata),
      metadata,
    },
  };
}

/** Check whether the user can edit. Stub: returns true when role includes 'editor' or 'admin'. */
export function canEdit(role: string | undefined): boolean {
  return role === 'editor' || role === 'admin' || role === 'owner';
}

/** Diff two metadata docs (returns field-level changes). */
export function diffMetadata(prev: ViewMetadataSpec, next: ViewMetadataSpec): string[] {
  const fields: string[] = [];
  if (prev.name !== next.name) fields.push('name');
  if (JSON.stringify(prev.columns) !== JSON.stringify(next.columns)) fields.push('columns');
  if (JSON.stringify(prev.filters) !== JSON.stringify(next.filters)) fields.push('filters');
  if (JSON.stringify(prev.sorts) !== JSON.stringify(next.sorts)) fields.push('sorts');
  if (JSON.stringify(prev.groups) !== JSON.stringify(next.groups)) fields.push('groups');
  if (JSON.stringify(prev.condFormats) !== JSON.stringify(next.condFormats)) fields.push('condFormats');
  return fields;
}