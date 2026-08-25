/**
 * View Layout Engine — types (Stage 113).
 *
 * Computes pixel-perfect layout for grid / kanban / gallery / calendar / form
 * / map / timeline views given a ViewMetadataSpec + viewport size.
 */

import { ViewKind, ViewMetadataSpec } from '../view-metadata-schema/view-metadata-schema.types';

export interface ViewportSpec {
  width: number;
  height: number;
  /** Device pixel ratio for hi-dpi rendering. */
  dpr: number;
}

export interface CellPosition {
  row: number;
  column: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GridLayoutCell {
  position: CellPosition;
  rect: Rect;
  columnId: string;
}

export interface GridLayoutSpec {
  kind: 'grid';
  viewport: ViewportSpec;
  headerHeight: number;
  rowHeight: number;
  cells: GridLayoutCell[];
  totalWidth: number;
  totalHeight: number;
}

export interface KanbanLayoutColumn {
  stackId: string;
  label: string;
  rect: Rect;
  cardCount: number;
}

export interface KanbanLayoutSpec {
  kind: 'kanban';
  viewport: ViewportSpec;
  columns: KanbanLayoutColumn[];
  cardHeight: number;
  totalWidth: number;
  totalHeight: number;
}

export interface GalleryLayoutCard {
  index: number;
  rect: Rect;
}

export interface GalleryLayoutSpec {
  kind: 'gallery';
  viewport: ViewportSpec;
  cards: GalleryLayoutCard[];
  columns: number;
  totalHeight: number;
}

export interface CalendarLayoutCell {
  date: string;
  rect: Rect;
}

export interface CalendarLayoutSpec {
  kind: 'calendar';
  viewport: ViewportSpec;
  cells: CalendarLayoutCell[];
  weekRows: number;
  totalHeight: number;
}

export interface FormLayoutField {
  fieldId: string;
  rect: Rect;
  visible: boolean;
}

export interface FormLayoutSpec {
  kind: 'form';
  viewport: ViewportSpec;
  fields: FormLayoutField[];
  totalHeight: number;
}

export interface MapLayoutMarker {
  index: number;
  rect: Rect;
  lat: number;
  lng: number;
}

export interface MapLayoutSpec {
  kind: 'map';
  viewport: ViewportSpec;
  markers: MapLayoutMarker[];
}

export interface TimelineLayoutBar {
  index: number;
  rect: Rect;
  label: string;
}

export interface TimelineLayoutSpec {
  kind: 'timeline';
  viewport: ViewportSpec;
  bars: TimelineLayoutBar[];
  rowHeight: number;
  totalHeight: number;
}

export type ViewLayoutSpec =
  | GridLayoutSpec
  | KanbanLayoutSpec
  | GalleryLayoutSpec
  | CalendarLayoutSpec
  | FormLayoutSpec
  | MapLayoutSpec
  | TimelineLayoutSpec;

export const DEFAULT_HEADER_HEIGHT = 32;
export const DEFAULT_ROW_HEIGHT = 32;
export const DEFAULT_GALLERY_CARD_SIZE = 220;
export const DEFAULT_KANBAN_CARD_HEIGHT = 96;
export const DEFAULT_TIMELINE_ROW_HEIGHT = 36;
export const DEFAULT_CALENDAR_DAY_SIZE = 120;