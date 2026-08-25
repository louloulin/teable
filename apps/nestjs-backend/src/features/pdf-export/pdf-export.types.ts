/**
 * PDF / print template export — Stage 57.
 *
 * Self-contained PDF generation: we emit a minimal valid PDF 1.4
 * document with built-in Helvetica, lines, rectangles, and a QR
 * placeholder. No external dependency.
 */

export type PageOrientation = 'portrait' | 'landscape';

export interface IPageSize {
  /** Page width in points (1pt = 1/72 inch). */
  width: number;
  /** Page height in points. */
  height: number;
}

export interface IPdfDocumentOptions {
  title: string;
  author?: string;
  /** Page size preset name. */
  pageSize: 'A4' | 'Letter' | 'A3';
  orientation: PageOrientation;
  /** Header text rendered on every page. */
  header?: string;
  /** Footer text rendered on every page (`{page}` and `{total}` placeholders). */
  footer?: string;
  /** When true, embed a QR code (size 80pt) in the bottom-right of each page linking to `qrPayload`. */
  includeQr?: boolean;
  /** Payload the QR encodes (URL or arbitrary string). */
  qrPayload?: string;
}

export interface IPdfTextBlock {
  kind: 'text';
  x: number;
  y: number;
  width: number;
  font: 'helvetica' | 'helvetica-bold';
  fontSize: number;
  /** Text content; supports `\n` for line breaks. */
  text: string;
}

export interface IPdfRectBlock {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: { r: number; g: number; b: number };
  stroke?: { r: number; g: number; b: number };
  strokeWidth?: number;
}

export interface IPdfLineBlock {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: { r: number; g: number; b: number };
  strokeWidth: number;
}

export interface IPdfTableRow {
  cells: ReadonlyArray<string>;
  /** Optional per-row tint. */
  tint?: { r: number; g: number; b: number };
}

export interface IPdfTableBlock {
  kind: 'table';
  x: number;
  y: number;
  /** Total available width. */
  width: number;
  /** Column widths summing to `width`. */
  columnWidths: ReadonlyArray<number>;
  header: ReadonlyArray<string>;
  rows: ReadonlyArray<IPdfTableRow>;
  fontSize: number;
  rowHeight: number;
}

export type IPdfBlock = IPdfTextBlock | IPdfRectBlock | IPdfLineBlock | IPdfTableBlock;

export interface IPdfPage {
  blocks: ReadonlyArray<IPdfBlock>;
}

export interface IPdfBuildResult {
  /** Raw PDF bytes. */
  bytes: Uint8Array;
  /** Number of pages. */
  pageCount: number;
  /** Base64 representation. */
  base64: string;
}

export const PAGE_SIZES = {
  A4: { width: 595, height: 842 },
  Letter: { width: 612, height: 792 },
  A3: { width: 842, height: 1191 },
} as const satisfies Record<string, IPageSize>;
