/**
 * View Config Panel API — pure helpers spec (Stage 115).
 */

import {
  applyPatches,
  buildPanelResponse,
  canEdit,
  diffMetadata,
  hashMetadata,
  processPatchRequest,
} from './view-config-panel-api.service';
import { ViewMetadataSpec } from '../view-metadata-schema/view-metadata-schema.types';
import { ViewConfigPanelRequest } from './view-config-panel-api.types';

function meta(over: Partial<ViewMetadataSpec> = {}): ViewMetadataSpec {
  return {
    id: 'v1', name: 'V', kind: 'grid', version: 1, options: {},
    columns: [{ id: 'a', width: 100 }, { id: 'b', width: 200 }],
    filters: [], sorts: [], groups: [], condFormats: [], ...over,
  };
}
function req(): ViewConfigPanelRequest { return { viewId: 'v1', tableId: 't1', baseId: 'b1' }; }

describe('view-config-panel-api.buildPanelResponse', () => {
  it('all sections', () => {
    const m = meta({
      filters: [{ id: 'f', fieldId: 'a', op: 'equals' }],
      sorts: [{ id: 's', fieldId: 'a', direction: 'asc' }],
      groups: [{ id: 'g', fieldId: 'a' }],
      condFormats: [{ id: 'c', fieldId: 'a', op: 'equals', value: 1, visualization: 'color' }],
    });
    const r = buildPanelResponse(req(), m, true);
    expect(r.kind).toBe('grid');
    expect(r.canEdit).toBe(true);
    expect(r.sections.length).toBe(5);
    expect(r.sections[0].kind).toBe('columns');
  });
  it('canEdit false', () => {
    const r = buildPanelResponse(req(), meta(), false);
    expect(r.canEdit).toBe(false);
  });
});

describe('view-config-panel-api.hashMetadata', () => {
  it('stable', () => {
    expect(hashMetadata(meta())).toBe(hashMetadata(meta()));
  });
  it('different name different hash', () => {
    expect(hashMetadata(meta({ name: 'A' }))).not.toBe(hashMetadata(meta({ name: 'B' })));
  });
});

describe('view-config-panel-api.applyPatches', () => {
  it('column patch', () => {
    const { metadata, applied } = applyPatches(meta(), [
      { kind: 'columns', columns: [{ id: 'a', width: 300, hidden: true, pinned: false }] },
    ]);
    expect(metadata.columns[0].width).toBe(300);
    expect(metadata.columns[0].hidden).toBe(true);
    expect(applied).toBe(1);
  });
  it('filter patch', () => {
    const { metadata } = applyPatches(meta(), [
      { kind: 'filters', filters: [{ id: 'f', fieldId: 'a', op: 'equals', value: 1 }] },
    ]);
    expect(metadata.filters.length).toBe(1);
  });
  it('sort patch', () => {
    const { metadata } = applyPatches(meta(), [
      { kind: 'sorts', sorts: [{ id: 's', fieldId: 'a', direction: 'desc' }] },
    ]);
    expect(metadata.sorts[0].direction).toBe('desc');
  });
  it('group patch', () => {
    const { metadata } = applyPatches(meta(), [
      { kind: 'groups', groups: [{ id: 'g', fieldId: 'a', hiddenValues: ['x'] }] },
    ]);
    expect(metadata.groups[0].hiddenValues).toEqual(['x']);
  });
  it('condFormat patch', () => {
    const { metadata } = applyPatches(meta(), [
      { kind: 'condFormats', condFormats: [{ id: 'c', fieldId: 'a', op: 'equals', value: 1, visualization: 'icon', style: 'star' }] },
    ]);
    expect(metadata.condFormats[0].style).toBe('star');
  });
});

describe('view-config-panel-api.processPatchRequest', () => {
  it('ok', () => {
    const m = meta();
    const res = processPatchRequest(m, hashMetadata(m), [
      { kind: 'sorts', sorts: [{ id: 's', fieldId: 'a', direction: 'asc' }] },
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.response.applied).toBe(1);
  });
  it('conflict', () => {
    const res = processPatchRequest(meta(), 'wronghash', []);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('conflict');
  });
});

describe('view-config-panel-api.canEdit', () => {
  it('owner / admin / editor', () => {
    expect(canEdit('owner')).toBe(true);
    expect(canEdit('admin')).toBe(true);
    expect(canEdit('editor')).toBe(true);
  });
  it('viewer', () => {
    expect(canEdit('viewer')).toBe(false);
    expect(canEdit(undefined)).toBe(false);
  });
});

describe('view-config-panel-api.diffMetadata', () => {
  it('detects changes', () => {
    const m = meta();
    const d = diffMetadata(m, { ...m, name: 'X' });
    expect(d).toContain('name');
  });
  it('empty diff', () => {
    expect(diffMetadata(meta(), meta())).toEqual([]);
  });
});