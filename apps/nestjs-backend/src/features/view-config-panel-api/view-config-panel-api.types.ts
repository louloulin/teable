/**
 * View Config Panel API — types (Stage 115).
 *
 * Public-facing view configuration DTOs and shape contracts.
 */

import { ViewKind, ViewMetadataSpec } from '../view-metadata-schema/view-metadata-schema.types';

export interface ViewConfigPanelRequest {
  viewId: string;
  tableId: string;
  baseId: string;
}

export interface ViewConfigPanelColumnSection {
  kind: 'columns';
  columns: Array<{ id: string; width: number; hidden: boolean; pinned: boolean; label?: string }>;
}

export interface ViewConfigPanelFilterSection {
  kind: 'filters';
  filters: Array<{ id: string; fieldId: string; op: string; value?: unknown }>;
}

export interface ViewConfigPanelSortSection {
  kind: 'sorts';
  sorts: Array<{ id: string; fieldId: string; direction: 'asc' | 'desc' }>;
}

export interface ViewConfigPanelGroupSection {
  kind: 'groups';
  groups: Array<{ id: string; fieldId: string; hiddenValues?: readonly string[] }>;
}

export interface ViewConfigPanelCondFormatSection {
  kind: 'condFormats';
  condFormats: Array<{ id: string; fieldId: string; op: string; value: unknown; visualization: string; style?: string }>;
}

export type ViewConfigPanelSection =
  | ViewConfigPanelColumnSection
  | ViewConfigPanelFilterSection
  | ViewConfigPanelSortSection
  | ViewConfigPanelGroupSection
  | ViewConfigPanelCondFormatSection;

export interface ViewConfigPanelResponse {
  viewId: string;
  kind: ViewKind;
  name: string;
  sections: ViewConfigPanelSection[];
  /** True when the requesting user can edit. */
  canEdit: boolean;
}

export interface ViewConfigPanelPatchRequest {
  viewId: string;
  /** SHA-256 hash for optimistic concurrency. */
  baseHash: string;
  /** Patch sections. */
  patches: ViewConfigPanelSection[];
  /** Optional full replacement. */
  replacement?: ViewMetadataSpec;
}

export interface ViewConfigPanelPatchResponse {
  viewId: string;
  applied: number;
  hash: string;
  metadata: ViewMetadataSpec;
}

export interface ViewConfigPanelError {
  code: 'unauthorized' | 'not_found' | 'conflict' | 'invalid_patch';
  message: string;
}