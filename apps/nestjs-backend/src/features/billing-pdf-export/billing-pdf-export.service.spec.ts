/**
 * Monthly billing PDF export — pure helpers spec (Stage 84).
 */

import {
  buildPdf,
  buildSummary,
  escapePdfText,
  formatCents,
  paginateLines,
  renderInvoicePdf,
  validateInvoice,
} from './billing-pdf-export.service';
import type { IBillingInvoice, IBillingLineItem } from './billing-pdf-export.types';

const baseLine = (over: Partial<IBillingLineItem> = {}): IBillingLineItem => ({
  id: 'l1',
  description: 'Seats',
  quantity: 1,
  unitCents: 2400,
  totalCents: 2400,
  periodStart: '2026-01-01T00:00:00Z',
  periodEnd: '2026-01-31T00:00:00Z',
  ...over,
});

const baseInvoice = (over: Partial<IBillingInvoice> = {}): IBillingInvoice => ({
  id: 'inv_1',
  orgId: 'o1',
  customerName: 'Acme Inc',
  currency: 'USD',
  periodStart: '2026-01-01T00:00:00Z',
  periodEnd: '2026-01-31T00:00:00Z',
  issuedAt: '2026-02-01T00:00:00Z',
  lines: [baseLine()],
  ...over,
});

describe('billing-pdf-export.validateInvoice', () => {
  it('passes', () => {
    expect(validateInvoice(baseInvoice())).toBeNull();
  });
  it('rejects missing customerName', () => {
    expect(validateInvoice(baseInvoice({ customerName: '' }))).toContain('customerName');
  });
  it('rejects inverted period', () => {
    expect(
      validateInvoice(
        baseInvoice({ periodStart: '2026-01-31T00:00:00Z', periodEnd: '2026-01-01T00:00:00Z' })
      )
    ).toContain('periodEnd must be after periodStart');
  });
  it('rejects line total mismatch', () => {
    expect(validateInvoice(baseInvoice({ lines: [baseLine({ totalCents: 9999 })] }))).toContain(
      'totalCents mismatch'
    );
  });
});

describe('billing-pdf-export.buildSummary', () => {
  it('sums', () => {
    const out = buildSummary(
      baseInvoice({
        lines: [baseLine(), baseLine({ id: 'l2', totalCents: 500, unitCents: 500 })],
      })
    );
    expect(out.subtotalCents).toBe(2900);
    expect(out.totalCents).toBe(2900);
    expect(out.lineCount).toBe(2);
  });
  it('applies tax bps', () => {
    const out = buildSummary(
      baseInvoice({
        lines: [baseLine({ totalCents: 10000 })],
        taxBps: 500,
      })
    );
    expect(out.taxCents).toBe(500);
    expect(out.totalCents).toBe(10500);
  });
});

describe('billing-pdf-export.formatCents', () => {
  it('formats', () => {
    expect(formatCents(1234, 'USD')).toBe('USD 12.34');
    expect(formatCents(-50, 'EUR')).toBe('-EUR 0.50');
  });
});

describe('billing-pdf-export.escapePdfText', () => {
  it('escapes', () => {
    expect(escapePdfText('a(b)c\\d')).toBe('a\\(b\\)c\\\\d');
  });
});

describe('billing-pdf-export.paginateLines', () => {
  it('splits', () => {
    const lines = Array.from({ length: 75 }, (_, i) =>
      baseLine({ id: `l${i}`, totalCents: i + 1, unitCents: i + 1 })
    );
    const out = paginateLines({ lines, maxPerPage: 30 });
    expect(out.length).toBe(3);
    expect(out[0]!.length).toBe(30);
    expect(out[1]!.length).toBe(30);
    expect(out[2]!.length).toBe(15);
  });
});

describe('billing-pdf-export.buildPdf', () => {
  it('produces header and trailer', () => {
    const out = buildPdf({ pages: [['hello', 'world']] });
    const text = new TextDecoder().decode(out.bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.includes('%%EOF')).toBe(true);
    expect(out.size).toBeGreaterThan(0);
    expect(out.sha256.length).toBe(64);
  });
});

describe('billing-pdf-export.renderInvoicePdf', () => {
  it('renders', () => {
    const out = renderInvoicePdf(
      baseInvoice({
        lines: [baseLine(), baseLine({ id: 'l2', description: 'Storage' })],
      })
    );
    expect(out.pageCount).toBe(1);
    expect(out.summary.lineCount).toBe(2);
    expect(out.doc.size).toBeGreaterThan(0);
  });
  it('paginates multiple pages', () => {
    const lines = Array.from({ length: 50 }, (_, i) =>
      baseLine({ id: `l${i}`, description: `Line ${i}` })
    );
    const out = renderInvoicePdf(baseInvoice({ lines }));
    expect(out.pageCount).toBe(2);
  });
  it('warns empty', () => {
    const out = renderInvoicePdf(baseInvoice({ lines: [] }));
    expect(out.warnings.some((w) => w.includes('no line items'))).toBe(true);
  });
  it('rejects invalid', () => {
    expect(() => renderInvoicePdf(baseInvoice({ customerName: '' }))).toThrow();
  });
});
