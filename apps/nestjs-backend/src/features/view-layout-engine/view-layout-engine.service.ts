/**
 * View Layout Engine — pure helpers (Stage 113).
 */

import { ViewMetadataSpec } from '../view-metadata-schema/view-metadata-schema.types';
import {
  CalendarLayoutSpec,
  DEFAULT_CALENDAR_DAY_SIZE,
  DEFAULT_GALLERY_CARD_SIZE,
  DEFAULT_HEADER_HEIGHT,
  DEFAULT_KANBAN_CARD_HEIGHT,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_TIMELINE_ROW_HEIGHT,
  FormLayoutSpec,
  GalleryLayoutSpec,
  GridLayoutCell,
  GridLayoutSpec,
  KanbanLayoutColumn,
  KanbanLayoutSpec,
  MapLayoutSpec,
  TimelineLayoutSpec,
  ViewLayoutSpec,
  ViewportSpec,
} from './view-layout-engine.types';

/** Compute the viewport's effective width (clamped to dpr). */
export function effectiveViewport(vp: ViewportSpec): ViewportSpec {
  return { ...vp, width: Math.max(0, Math.floor(vp.width)), height: Math.max(0, Math.floor(vp.height)) };
}

/** Layout a grid view. */
export function layoutGrid(meta: ViewMetadataSpec, viewport: ViewportSpec, rowCount: number): GridLayoutSpec {
  const visible = meta.columns.filter((c) => !c.hidden);
  const headerH = DEFAULT_HEADER_HEIGHT;
  const rowH = rowHeightFor(meta);
  const cells: GridLayoutCell[] = [];
  let x = 0;
  for (let c = 0; c < visible.length; c++) {
    const col = visible[c];
    const width = c === 0 && meta.kind === 'grid' ? Math.max(col.width, viewport.width) : col.width;
    for (let r = 0; r < rowCount; r++) {
      cells.push({
        position: { row: r, column: c },
        rect: { x, y: headerH + r * rowH, width, height: rowH },
        columnId: col.id,
      });
    }
    x += width;
  }
  return {
    kind: 'grid',
    viewport: effectiveViewport(viewport),
    headerHeight: headerH,
    rowHeight: rowH,
    cells,
    totalWidth: x,
    totalHeight: headerH + rowH * rowCount,
  };
}

function rowHeightFor(meta: ViewMetadataSpec): number {
  const rh = (meta.options as { rowHeight?: string }).rowHeight;
  if (rh === 'short') return 24;
  if (rh === 'tall') return 48;
  if (rh === 'extra-tall') return 72;
  return DEFAULT_ROW_HEIGHT;
}

/** Layout a kanban view. */
export function layoutKanban(meta: ViewMetadataSpec, viewport: ViewportSpec, stackBuckets: ReadonlyArray<{ id: string; label: string; count: number }>): KanbanLayoutSpec {
  const cardH = DEFAULT_KANBAN_CARD_HEIGHT;
  const colWidth = 280;
  const columns: KanbanLayoutColumn[] = stackBuckets.map((b, i) => ({
    stackId: b.id,
    label: b.label,
    rect: { x: i * (colWidth + 12), y: 0, width: colWidth, height: viewport.height },
    cardCount: b.count,
  }));
  return {
    kind: 'kanban',
    viewport: effectiveViewport(viewport),
    columns,
    cardHeight: cardH,
    totalWidth: columns.length * (colWidth + 12),
    totalHeight: viewport.height,
  };
}

/** Layout a gallery view. */
export function layoutGallery(meta: ViewMetadataSpec, viewport: ViewportSpec, cardCount: number): GalleryLayoutSpec {
  const cardSize = DEFAULT_GALLERY_CARD_SIZE;
  const cols = Math.max(1, Math.floor(viewport.width / (cardSize + 12)));
  const cards = Array.from({ length: cardCount }, (_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    return {
      index: i,
      rect: { x: c * (cardSize + 12), y: r * (cardSize + 12), width: cardSize, height: cardSize },
    };
  });
  const rows = Math.ceil(cardCount / cols);
  return {
    kind: 'gallery',
    viewport: effectiveViewport(viewport),
    cards,
    columns: cols,
    totalHeight: rows * (cardSize + 12),
  };
}

/** Layout a calendar view (month). */
export function layoutCalendar(viewport: ViewportSpec, year: number, month: number): CalendarLayoutSpec {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay();
  const totalCells = startOffset + daysInMonth;
  const weekRows = Math.ceil(totalCells / 7);
  const daySize = Math.max(80, Math.min(DEFAULT_CALENDAR_DAY_SIZE, Math.floor(viewport.width / 7)));
  const cells = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const idx = startOffset + i;
    const col = idx % 7;
    const row = Math.floor(idx / 7);
    return {
      date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      rect: { x: col * daySize, y: row * daySize, width: daySize, height: daySize },
    };
  });
  return {
    kind: 'calendar',
    viewport: effectiveViewport(viewport),
    cells,
    weekRows,
    totalHeight: weekRows * daySize,
  };
}

/** Layout a form view. */
export function layoutForm(meta: ViewMetadataSpec, viewport: ViewportSpec): FormLayoutSpec {
  const visible = meta.columns.filter((c) => !c.hidden);
  const fields = visible.map((c, i) => ({
    fieldId: c.id,
    rect: { x: 0, y: i * 56, width: viewport.width, height: 56 },
    visible: !c.hidden,
  }));
  return {
    kind: 'form',
    viewport: effectiveViewport(viewport),
    fields,
    totalHeight: fields.length * 56,
  };
}

/** Layout a map view (markers list). */
export function layoutMap(viewport: ViewportSpec, markers: ReadonlyArray<{ lat: number; lng: number }>): MapLayoutSpec {
  return {
    kind: 'map',
    viewport: effectiveViewport(viewport),
    markers: markers.map((m, i) => ({
      index: i,
      rect: { x: (i * 32) % viewport.width, y: ((i * 32) % viewport.height), width: 24, height: 24 },
      lat: m.lat,
      lng: m.lng,
    })),
  };
}

/** Layout a timeline view. */
export function layoutTimeline(viewport: ViewportSpec, barCount: number, labels: readonly string[]): TimelineLayoutSpec {
  const rowH = DEFAULT_TIMELINE_ROW_HEIGHT;
  const bars = Array.from({ length: barCount }, (_, i) => ({
    index: i,
    rect: { x: 0, y: i * rowH, width: viewport.width, height: rowH },
    label: labels[i] ?? '',
  }));
  return {
    kind: 'timeline',
    viewport: effectiveViewport(viewport),
    bars,
    rowHeight: rowH,
    totalHeight: barCount * rowH,
  };
}

/** Dispatch to the right layout function based on kind. */
export function computeLayout(
  meta: ViewMetadataSpec,
  viewport: ViewportSpec,
  input: { rows?: number; buckets?: ReadonlyArray<{ id: string; label: string; count: number }>; cards?: number; year?: number; month?: number; markers?: ReadonlyArray<{ lat: number; lng: number }>; barLabels?: readonly string[] } = {},
): ViewLayoutSpec {
  switch (meta.kind) {
    case 'grid':
      return layoutGrid(meta, viewport, input.rows ?? 0);
    case 'kanban':
      return layoutKanban(meta, viewport, input.buckets ?? []);
    case 'gallery':
      return layoutGallery(meta, viewport, input.cards ?? 0);
    case 'calendar':
      return layoutCalendar(viewport, input.year ?? new Date().getFullYear(), input.month ?? new Date().getMonth());
    case 'form':
      return layoutForm(meta, viewport);
    case 'map':
      return layoutMap(viewport, input.markers ?? []);
    case 'timeline':
      return layoutTimeline(viewport, input.barLabels?.length ?? 0, input.barLabels ?? []);
    default:
      return layoutGrid(meta, viewport, 0);
  }
}