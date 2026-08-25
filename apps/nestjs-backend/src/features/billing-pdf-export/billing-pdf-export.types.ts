/**
 * Monthly billing PDF export — types (Stage 84).
 */

export const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/** A4 in points (1 pt = 1/72 inch). */
export const PDF_PAGE_WIDTH_PT = 595;
export const PDF_PAGE_HEIGHT_PT = 842;
export const PDF_MARGIN_PT = 48;
export const PDF_LINE_HEIGHT_PT = 16;

/** Maximum lines per page (header + footer + body). */
export const PDF_MAX_LINES_PER_PAGE = 40;

/** Tax rate (cents per 100 cents). */
export const DEFAULT_TAX_BPS = 0;

export const PDF_TITLE = 'Teable OSS — Monthly Billing Statement';

export interface IBillingLineItem {
  id: string;
  description: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
  periodStart: string;
  periodEnd: string;
}

export interface IBillingInvoice {
  id: string;
  orgId: string;
  customerName: string;
  customerEmail?: string;
  currency: CurrencyCode;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
  lines: IBillingLineItem[];
  taxBps?: number;
  notes?: string;
}

export interface IBillingSummary {
  invoiceId: string;
  currency: CurrencyCode;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  lineCount: number;
}

export interface IPdfDoc {
  bytes: Uint8Array;
  size: number;
  sha256: string;
}

export interface IPdfRenderResult {
  doc: IPdfDoc;
  pageCount: number;
  summary: IBillingSummary;
  warnings: string[];
}
