/* eslint-disable @typescript-eslint/naming-convention */
import {
  buildDocument,
  buildTableLayout,
  effectivePageSize,
  flipOrientation,
  paginateTable,
} from './pdf-export.service';
import { PAGE_SIZES } from './pdf-export.types';
import type { IPdfDocumentOptions } from './pdf-export.types';

describe('pdf-export.pageSize', () => {
  it('returns A4 in portrait', () => {
    const ps = effectivePageSize({ pageSize: 'A4', orientation: 'portrait', title: 't' });
    expect(ps).toEqual(PAGE_SIZES.A4);
  });
  it('swaps dimensions in landscape', () => {
    const ps = effectivePageSize({ pageSize: 'Letter', orientation: 'landscape', title: 't' });
    expect(ps.width).toBe(PAGE_SIZES.Letter.height);
    expect(ps.height).toBe(PAGE_SIZES.Letter.width);
  });
  it('flips orientation helper', () => {
    expect(flipOrientation('portrait')).toBe('landscape');
    expect(flipOrientation('landscape')).toBe('portrait');
  });
});

describe('pdf-export.buildTableLayout', () => {
  it('splits width evenly when columnWidths omitted', () => {
    const t = buildTableLayout(
      { header: ['A', 'B', 'C'], rows: [['x', 'y', 'z']] },
      { x: 0, y: 0, width: 60 }
    );
    expect(t.columnWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(60);
    expect(t.columnWidths).toHaveLength(3);
  });
  it('uses provided columnWidths', () => {
    const t = buildTableLayout(
      { header: ['A', 'B'], rows: [['x', 'y']], columnWidths: [10, 30] },
      { x: 0, y: 0, width: 40 }
    );
    expect(t.columnWidths).toEqual([10, 30]);
  });
});

describe('pdf-export.paginateTable', () => {
  it('chunks into pages', () => {
    const blocks = paginateTable(
      { header: ['A'], rows: Array.from({ length: 100 }, () => ['x']) },
      { x: 0, y: 0, width: 100, pageRows: 10 }
    );
    expect(blocks).toHaveLength(10);
    expect(blocks[0]?.rows).toHaveLength(10);
  });
  it('returns a single page when rows fit', () => {
    const blocks = paginateTable(
      { header: ['A'], rows: [['1'], ['2']] },
      { x: 0, y: 0, width: 100, pageRows: 10 }
    );
    expect(blocks).toHaveLength(1);
  });
});

describe('pdf-export.buildDocument', () => {
  it('produces a valid PDF header + EOF', () => {
    const out = buildDocument({
      options: { pageSize: 'A4', orientation: 'portrait', title: 'Hello' },
      buildPages: () => [{ blocks: [] }],
    });
    expect(out.bytes[0]).toBe(0x25); // '%'
    const text = new TextDecoder('latin1').decode(out.bytes.slice(0, 8));
    expect(text).toBe('%PDF-1.4');
    const tail = new TextDecoder('latin1').decode(out.bytes.slice(out.bytes.length - 5));
    expect(tail).toBe('%%EOF');
  });
  it('emits one page per buildPages entry', () => {
    const out = buildDocument({
      options: { pageSize: 'A4', orientation: 'portrait', title: 't' },
      buildPages: () => [{ blocks: [] }, { blocks: [] }, { blocks: [] }],
    });
    expect(out.pageCount).toBe(3);
  });
  it('base64 round-trips back to the same bytes', () => {
    const out = buildDocument({
      options: { pageSize: 'A4', orientation: 'portrait', title: 't' },
      buildPages: () => [{ blocks: [] }],
    });
    const decoded = Buffer.from(out.base64, 'base64');
    expect(decoded.length).toBe(out.bytes.length);
    expect(decoded[0]).toBe(0x25);
  });
  it('renders with header + footer + QR placeholder', () => {
    const opts: IPdfDocumentOptions = {
      pageSize: 'A4',
      orientation: 'portrait',
      title: 'T',
      header: 'My Header',
      footer: 'p{page}/{total}',
      includeQr: true,
      qrPayload: 'https://example.com/share/abc',
    };
    const out = buildDocument({
      options: opts,
      buildPages: () => [{ blocks: [] }],
    });
    // Just check it doesn't blow up + still a PDF
    const text = new TextDecoder('latin1').decode(out.bytes);
    expect(text).toContain('My Header');
    expect(text).toContain('p1/1');
    expect(text).toContain('QR: https://example.com/share/abc');
  });
  it('renders landscape A3', () => {
    const out = buildDocument({
      options: { pageSize: 'A3', orientation: 'landscape', title: 'Wide' },
      buildPages: () => [{ blocks: [] }],
    });
    expect(out.pageCount).toBe(1);
  });
  it('escapes parens in titles', () => {
    const out = buildDocument({
      options: { pageSize: 'A4', orientation: 'portrait', title: 'Hello (world)' },
      buildPages: () => [{ blocks: [] }],
    });
    const text = new TextDecoder('latin1').decode(out.bytes);
    expect(text).toContain('Hello \\(world\\)');
  });
});
