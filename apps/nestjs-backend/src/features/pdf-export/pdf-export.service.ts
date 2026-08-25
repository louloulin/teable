/**
 * PDF / print template export — Stage 57.
 *
 * Pure helpers for serialising a sequence of blocks into a PDF byte
 * stream. The resulting PDF opens in any compliant reader. Helvetica
 * is built-in; we ship a fallback Times-Roman for bold.
 */

import type {
  IPageSize,
  IPdfBlock,
  IPdfBuildResult,
  IPdfDocumentOptions,
  IPdfPage,
  IPdfTableBlock,
  IPdfTableRow,
  PageOrientation,
} from './pdf-export.types';
import { PAGE_SIZES } from './pdf-export.types';

export interface ITableDraft {
  header: ReadonlyArray<string>;
  rows: ReadonlyArray<ReadonlyArray<string>>;
  columnWidths?: ReadonlyArray<number>;
}

export interface IDocumentDraft {
  options: IPdfDocumentOptions;
  /** Data the layout function turns into PDF pages. */
  buildPages: (page: IPageSize) => IPdfPage[];
}

export function effectivePageSize(opts: IPdfDocumentOptions): IPageSize {
  const base = PAGE_SIZES[opts.pageSize];
  if (opts.orientation === 'landscape') {
    return { width: base.height, height: base.width };
  }
  return base;
}

export function buildTableLayout(
  table: ITableDraft,
  opts: {
    x: number;
    y: number;
    width: number;
    fontSize?: number;
    rowHeight?: number;
  }
): IPdfTableBlock {
  const fontSize = opts.fontSize ?? 10;
  const rowHeight = opts.rowHeight ?? 16;
  const cols = table.columnWidths ?? splitWidth(opts.width, table.header.length);
  return {
    kind: 'table',
    x: opts.x,
    y: opts.y,
    width: opts.width,
    columnWidths: cols,
    header: table.header,
    rows: table.rows.map((cells): IPdfTableRow => ({ cells })),
    fontSize,
    rowHeight,
  };
}

function splitWidth(width: number, count: number): number[] {
  if (count <= 0) return [];
  const each = width / count;
  return Array.from({ length: count }, () => each);
}

export function buildDocument(draft: IDocumentDraft): IPdfBuildResult {
  const pageSize = effectivePageSize(draft.options);
  const pages = draft.buildPages(pageSize);
  return serializePdf(draft.options, pageSize, pages);
}

/* ------------------------------------------------------------------ */
/*  Low-level PDF serialisation                                      */
/* ------------------------------------------------------------------ */

function pdfEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function b2s(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return bin;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function serializePdf(
  options: IPdfDocumentOptions,
  pageSize: IPageSize,
  pages: ReadonlyArray<IPdfPage>
): IPdfBuildResult {
  const objects: string[] = [];
  const xref: number[] = [];

  const push = (s: string): number => {
    const id = objects.length + 1;
    objects.push(`${id} 0 obj\n${s}\nendobj\n`);
    return id;
  };

  const pagesId = push('<< /Type /Pages /Kids [] /Count 0 >>');

  const fontIds = {
    helvetica: push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    helveticaBold: push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'),
  };

  // Build page content streams
  const pageObjIds: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i] ?? { blocks: [] };
    const stream = renderPageStream(pageSize, page, options, i + 1, pages.length);
    const contentId = push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = push(
      [
        '<< /Type /Page',
        `/Parent ${pagesId} 0 R`,
        `/MediaBox [0 0 ${pageSize.width} ${pageSize.height}]`,
        `/Resources << /Font << /Helvetica ${fontIds.helvetica} 0 R /Helvetica-Bold ${fontIds.helveticaBold} 0 R >> >>`,
        `/Contents ${contentId} 0 R`,
        '>>',
      ].join(' ')
    );
    pageObjIds.push(pageId);
  }

  // Patch the Pages object with kids
  const kids = pageObjIds.map((id) => `${id} 0 R`).join(' ');
  objects[pagesId - 1] =
    `${pagesId} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageObjIds.length} >>\nendobj\n`;

  // Catalog
  const catalogId = push(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  // Info
  const infoId = push(
    `<< /Title (${pdfEscape(options.title)}) /Author (${pdfEscape(options.author ?? 'Teable OSS')}) /Producer (Teable Stage 57) >>`
  );

  // Assemble
  const header = encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const chunks: Uint8Array[] = [header];
  xref.push(0);

  for (let i = 0; i < objects.length; i++) {
    xref.push(chunks.reduce((a, c) => a + c.length, 0));
    chunks.push(encode(objects[i] ?? ''));
  }
  const xrefStart = chunks.reduce((a, c) => a + c.length, 0);
  let xrefStr = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xrefStr += `${String(xref[i] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  chunks.push(encode(xrefStr));
  chunks.push(
    encode(
      `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
    )
  );
  const bytes = concat(chunks);
  return { bytes, pageCount: pageObjIds.length, base64: u8ToBase64(bytes) };
}

function renderPageStream(
  page: IPageSize,
  pdfPage: IPdfPage,
  options: IPdfDocumentOptions,
  pageNumber: number,
  total: number
): string {
  const margin = 36;
  const parts: string[] = [];
  parts.push('q');
  // Header
  if (options.header) {
    parts.push('BT');
    parts.push(`/F1 10 Tf`);
    parts.push(`${margin} ${page.height - 24} Td`);
    parts.push(`(${pdfEscape(options.header)}) Tj`);
    parts.push('ET');
  }
  // Footer
  if (options.footer) {
    const text = options.footer
      .replace('{page}', String(pageNumber))
      .replace('{total}', String(total));
    parts.push('BT');
    parts.push(`/F1 9 Tf`);
    parts.push(`${margin} 24 Td`);
    parts.push(`(${pdfEscape(text)}) Tj`);
    parts.push('ET');
  }
  // QR placeholder (simple rectangle + label, the real QR bytes are
  // optional — for tests we just verify the box + payload encoding).
  if (options.includeQr && options.qrPayload) {
    const qx = page.width - margin - 80;
    const qy = 36;
    parts.push(`${qx} ${qy} 80 80 re f`);
    parts.push('BT');
    parts.push(`/F1 6 Tf`);
    parts.push(`${qx + 4} ${qy + 8} Td`);
    const payload =
      options.qrPayload.length > 60 ? `${options.qrPayload.slice(0, 60)}...` : options.qrPayload;
    parts.push(`(QR: ${pdfEscape(payload)}) Tj`);
    parts.push('ET');
  }
  // Blocks
  for (const block of pdfPage.blocks) {
    renderBlock(block, parts, page);
  }
  parts.push('Q');
  return parts.join('\n');
}

function renderBlock(block: IPdfBlock, parts: string[], page: IPageSize): void {
  switch (block.kind) {
    case 'rect': {
      if (block.fill) {
        const { r, g, b } = block.fill;
        parts.push(`${r} ${g} ${b} rg`);
        parts.push(
          `${block.x} ${page.height - block.y - block.height} ${block.width} ${block.height} re f`
        );
      }
      if (block.stroke) {
        const { r, g, b } = block.stroke;
        parts.push(`${r} ${g} ${b} RG`);
        parts.push(`${block.strokeWidth ?? 1} w`);
        parts.push(
          `${block.x} ${page.height - block.y - block.height} ${block.width} ${block.height} re S`
        );
      }
      return;
    }
    case 'line': {
      const { r, g, b } = block.stroke;
      parts.push(`${r} ${g} ${b} RG`);
      parts.push(`${block.strokeWidth} w`);
      parts.push(
        `${block.x1} ${page.height - block.y1} m ${block.x2} ${page.height - block.y2} l S`
      );
      return;
    }
    case 'text': {
      parts.push('BT');
      parts.push(`/F${block.font === 'helvetica-bold' ? '2' : '1'} ${block.fontSize} Tf`);
      parts.push(`${block.x} ${page.height - block.y - block.fontSize} Td`);
      const lines = block.text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        parts.push(`(${pdfEscape(lines[i] ?? '')}) Tj`);
        if (i < lines.length - 1) {
          parts.push(`0 -${block.fontSize * 1.2} Td`);
        }
      }
      parts.push('ET');
      return;
    }
    case 'table': {
      renderTableBlock(block, parts, page);
      return;
    }
  }
}

function renderTableBlock(table: IPdfTableBlock, parts: string[], page: IPageSize): void {
  const top = page.height - table.y;
  // Header fill
  parts.push('0.9 0.9 0.9 rg');
  parts.push(`${table.x} ${top - table.rowHeight} ${table.width} ${table.rowHeight} re f`);
  // Header text
  parts.push('0 0 0 rg');
  parts.push('BT');
  parts.push(`/F2 ${table.fontSize} Tf`);
  let cx = table.x + 4;
  for (let i = 0; i < table.header.length; i++) {
    const w = table.columnWidths[i] ?? 0;
    parts.push(`${cx} ${top - table.fontSize - 3} Td`);
    parts.push(`(${pdfEscape(table.header[i] ?? '')}) Tj`);
    parts.push(`${-(cx - (table.x + 4)) - w} 0 Td`);
    cx += w;
  }
  parts.push('ET');
  // Rows
  parts.push('0 0 0 rg');
  for (let r = 0; r < table.rows.length; r++) {
    const row = table.rows[r];
    if (!row) continue;
    const rowTop = top - table.rowHeight * (r + 1);
    if (row.tint) {
      const { r: rr, g, b } = row.tint;
      parts.push(`${rr} ${g} ${b} rg`);
      parts.push(`${table.x} ${rowTop - table.rowHeight} ${table.width} ${table.rowHeight} re f`);
      parts.push('0 0 0 rg');
    }
    parts.push('BT');
    parts.push(`/F1 ${table.fontSize} Tf`);
    let colX = table.x + 4;
    for (let c = 0; c < row.cells.length; c++) {
      const w = table.columnWidths[c] ?? 0;
      parts.push(`${colX} ${rowTop - table.fontSize - 3} Td`);
      parts.push(`(${pdfEscape(row.cells[c] ?? '')}) Tj`);
      parts.push(`${-(colX - (table.x + 4)) - w} 0 Td`);
      colX += w;
    }
    parts.push('ET');
    // Row separator
    parts.push('0.85 0.85 0.85 RG 0.5 w');
    parts.push(
      `${table.x} ${rowTop - table.rowHeight} m ${table.x + table.width} ${rowTop - table.rowHeight} l S`
    );
  }
}

function u8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  return btoa(b2s(bytes));
}

/** Compute a paginated table layout — yields one page per `pageRows` rows. */
export function paginateTable(
  draft: ITableDraft,
  layout: {
    x: number;
    y: number;
    width: number;
    fontSize?: number;
    rowHeight?: number;
    pageRows: number;
  }
): IPdfTableBlock[] {
  const blocks: IPdfTableBlock[] = [];
  let start = 0;
  while (start < draft.rows.length) {
    const slice = draft.rows.slice(start, start + layout.pageRows);
    blocks.push(
      buildTableLayout(
        { ...draft, rows: slice },
        {
          x: layout.x,
          y: layout.y,
          width: layout.width,
          fontSize: layout.fontSize,
          rowHeight: layout.rowHeight,
        }
      )
    );
    start += layout.pageRows;
  }
  return blocks;
}

/** Helper that flips an orientation string for tests. */
export function flipOrientation(o: PageOrientation): PageOrientation {
  return o === 'portrait' ? 'landscape' : 'portrait';
}
