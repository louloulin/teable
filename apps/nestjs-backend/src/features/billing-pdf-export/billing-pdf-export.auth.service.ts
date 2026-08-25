/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Monthly billing PDF export — NestJS auth service (Stage 84).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildSummary,
  formatCents,
  paginateLines,
  renderInvoicePdf,
  validateInvoice,
} from './billing-pdf-export.service';
import type {
  IBillingInvoice,
  IBillingLineItem,
  IPdfDoc,
  IPdfRenderResult,
} from './billing-pdf-export.types';

@Injectable()
export class BillingPdfExportAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Render a stored billing invoice (by id) into a PDF document. */
  async renderInvoice(invoiceId: string): Promise<IPdfRenderResult> {
    const row = await this.prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!row) throw new Error(`invoice not found: ${invoiceId}`);
    const invoice = this.rowToInvoice(row);
    return renderInvoicePdf(invoice);
  }

  /** Persist the PDF bytes (raw) into the billing_pdf_export table for later download. */
  async storeExport(input: { invoiceId: string; doc: IPdfDoc }): Promise<void> {
    await this.prisma.billingPdfExport.create({
      data: {
        id: `${input.invoiceId}:${Date.now()}`,
        invoiceId: input.invoiceId,
        bytes: Buffer.from(input.doc.bytes),
        size: input.doc.size,
        sha256: input.doc.sha256,
      },
    });
  }

  /** Re-export a previously stored PDF. */
  async latestExport(invoiceId: string): Promise<{ bytes: Uint8Array; sha256: string } | null> {
    const row = await this.prisma.billingPdfExport.findFirst({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return null;
    const buf = row['bytes'] as Buffer;
    return {
      bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
      sha256: String(row['sha256']),
    };
  }

  validateInvoice = validateInvoice;
  buildSummary = buildSummary;
  formatCents = formatCents;
  paginateLines = paginateLines;
  renderInvoicePdf = renderInvoicePdf;

  private rowToInvoice(r: Record<string, unknown>): IBillingInvoice {
    const rawLines = (r['lines'] as IBillingLineItem[] | undefined) ?? [];
    const out: IBillingInvoice = {
      id: String(r['id']),
      orgId: String(r['orgId']),
      customerName: String(r['customerName']),
      currency: r['currency'] as IBillingInvoice['currency'],
      periodStart: new Date(String(r['periodStart'])).toISOString(),
      periodEnd: new Date(String(r['periodEnd'])).toISOString(),
      issuedAt: new Date(String(r['issuedAt'])).toISOString(),
      lines: rawLines,
    };
    if (r['customerEmail']) out.customerEmail = String(r['customerEmail']);
    if (typeof r['taxBps'] === 'number') out.taxBps = Number(r['taxBps']);
    if (r['notes']) out.notes = String(r['notes']);
    return out;
  }
}
