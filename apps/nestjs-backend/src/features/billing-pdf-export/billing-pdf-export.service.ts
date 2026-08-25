/**
 * Monthly billing PDF export — pure helpers (Stage 84).
 */

import { createHash } from 'node:crypto';

import type {
  IBillingInvoice,
  IBillingLineItem,
  IBillingSummary,
  IPdfDoc,
  IPdfRenderResult,
} from './billing-pdf-export.types';
import {
  DEFAULT_TAX_BPS,
  PDF_MAX_LINES_PER_PAGE,
  PDF_PAGE_HEIGHT_PT,
  PDF_PAGE_WIDTH_PT,
  PDF_TITLE,
} from './billing-pdf-export.types';

/** Validate a billing invoice. */
export function validateInvoice(invoice: IBillingInvoice): string | null {
  const headerErr = validateInvoiceHeader(invoice);
  if (headerErr) return headerErr;
  if (!Array.isArray(invoice.lines)) return 'lines must be an array';
  for (const line of invoice.lines) {
    const lineErr = validateLineItem(line);
    if (lineErr) return lineErr;
  }
  return null;
}

function validateInvoiceHeader(invoice: IBillingInvoice): string | null {
  if (!invoice.id) return 'invoiceId required';
  if (!invoice.orgId) return 'orgId required';
  if (!invoice.customerName) return 'customerName required';
  if (!invoice.currency) return 'currency required';
  if (!invoice.periodStart || Number.isNaN(Date.parse(invoice.periodStart)))
    return 'periodStart must be ISO-8601';
  if (!invoice.periodEnd || Number.isNaN(Date.parse(invoice.periodEnd)))
    return 'periodEnd must be ISO-8601';
  if (Date.parse(invoice.periodEnd) <= Date.parse(invoice.periodStart))
    return 'periodEnd must be after periodStart';
  return null;
}

function validateLineItem(line: IBillingLineItem): string | null {
  if (!line.id) return 'line.id required';
  if (!line.description) return `line.description required for ${line.id}`;
  if (!Number.isFinite(line.quantity) || line.quantity <= 0)
    return `line.quantity must be > 0 for ${line.id}`;
  if (!Number.isFinite(line.unitCents) || line.unitCents < 0)
    return `line.unitCents must be >= 0 for ${line.id}`;
  if (line.totalCents !== line.unitCents * line.quantity)
    return `line.totalCents mismatch for ${line.id}`;
  return null;
}

/** Compute subtotal, tax, total. */
export function buildSummary(invoice: IBillingInvoice): IBillingSummary {
  let subtotal = 0;
  for (const l of invoice.lines) subtotal += l.totalCents;
  const taxBps = invoice.taxBps ?? DEFAULT_TAX_BPS;
  const tax = Math.floor((subtotal * taxBps) / 10_000);
  return {
    invoiceId: invoice.id,
    currency: invoice.currency,
    subtotalCents: subtotal,
    taxCents: tax,
    totalCents: subtotal + tax,
    lineCount: invoice.lines.length,
  };
}

/** Format cents as currency. */
export function formatCents(cents: number, currency: string): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const major = Math.floor(abs / 100);
  const minor = (abs % 100).toString().padStart(2, '0');
  return `${sign}${currency} ${major}.${minor}`;
}

/** Escape parentheses and backslashes for PDF text literals. */
export function escapePdfText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Paginate line items respecting per-page cap. */
export function paginateLines(input: {
  lines: IBillingLineItem[];
  maxPerPage?: number;
}): IBillingLineItem[][] {
  const max = input.maxPerPage ?? PDF_MAX_LINES_PER_PAGE;
  if (input.lines.length === 0) return [[]];
  const pages: IBillingLineItem[][] = [];
  for (let i = 0; i < input.lines.length; i += max) {
    pages.push(input.lines.slice(i, i + max));
  }
  return pages;
}

/** Build a minimal PDF (Type1 Helvetica) from a list of pages where each page is a list of text lines. */
export function buildPdf(input: { pages: string[][]; title?: string }): IPdfDoc {
  const objects: string[] = [];
  const offsets: number[] = [];

  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';

  function addObject(body: string): number {
    const id = objects.length + 1;
    objects.push(body);
    return id;
  }

  const fontObj = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pagesObj = addObject('<< /Type /Pages /Kids [] /Count 0 >>');
  const catalogObj = addObject(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);

  const pageObjectIds: number[] = [];
  for (const _ of input.pages) {
    const contentObj = addObject('<< /Length 0 >>\nstream\nendstream');
    const pageObj = addObject(
      `<< /Type /Page /Parent ${pagesObj} 0 R ` +
        `/MediaBox [0 0 ${PDF_PAGE_WIDTH_PT} ${PDF_PAGE_HEIGHT_PT}] ` +
        `/Resources << /Font << /F1 ${fontObj} 0 R >> >> ` +
        `/Contents ${contentObj} 0 R >>`
    );
    pageObjectIds.push(pageObj);
  }

  objects[pagesObj - 1] =
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] ` +
    `/Count ${pageObjectIds.length} >>`;

  let cursor = header.length;
  const serialized: string[] = [header];
  for (let i = 0; i < objects.length; i++) {
    offsets[i] = cursor;
    const objText = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    serialized.push(objText);
    cursor += objText.length;
  }

  const xrefOffset = cursor;
  const xref =
    `xref\n0 ${objects.length + 1}\n` +
    `0000000000 65535 f \n` +
    offsets.map((o) => o.toString().padStart(10, '0') + ' 00000 n \n').join('');
  serialized.push(xref);
  serialized.push(
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObj} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  const raw = serialized.join('');
  const bytes = new TextEncoder().encode(raw);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { bytes, size: bytes.length, sha256 };
}

/** Render an invoice to a minimal PDF document. */
export function renderInvoicePdf(invoice: IBillingInvoice): IPdfRenderResult {
  const err = validateInvoice(invoice);
  if (err) throw new Error(`invalid invoice: ${err}`);
  const summary = buildSummary(invoice);
  const pages = paginateLines({ lines: invoice.lines });
  const warnings: string[] = [];
  if (invoice.lines.length === 0) warnings.push('invoice has no line items');
  const textPages: string[][] = [];
  for (let p = 0; p < pages.length; p++) {
    textPages.push(renderPage(invoice, summary, pages[p]!, p, pages.length));
  }
  const doc = buildPdf({ pages: textPages, title: PDF_TITLE });
  return { doc, pageCount: textPages.length, summary, warnings };
}

function renderPage(
  invoice: IBillingInvoice,
  summary: IBillingSummary,
  lines: IBillingLineItem[],
  pageIndex: number,
  pageCount: number
): string[] {
  const out: string[] = [];
  out.push(`${invoice.customerName} | ${invoice.id} | page ${pageIndex + 1}/${pageCount}`);
  out.push(`Period: ${invoice.periodStart} → ${invoice.periodEnd}`);
  out.push(`Currency: ${invoice.currency}`);
  out.push('Description                                  Qty  Unit         Total');
  for (const l of lines) {
    const desc = l.description.padEnd(46).slice(0, 46);
    const qty = String(l.quantity).padStart(3);
    const unit = formatCents(l.unitCents, invoice.currency).padStart(12);
    const total = formatCents(l.totalCents, invoice.currency).padStart(12);
    out.push(`${desc} ${qty}  ${unit}  ${total}`);
  }
  out.push('');
  out.push(`Subtotal: ${formatCents(summary.subtotalCents, invoice.currency)}`);
  out.push(`Tax:      ${formatCents(summary.taxCents, invoice.currency)}`);
  out.push(`Total:    ${formatCents(summary.totalCents, invoice.currency)}`);
  return out;
}
