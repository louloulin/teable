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
  IPdfDoc,
  IPdfRenderResult,
} from './billing-pdf-export.types';

@Injectable()
export class BillingPdfExportAuthService {
  constructor(private readonly prisma: PrismaService) {}

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

  /**
   * Return the most recent cached PDF bytes for an invoice, or null if
   * no cache row exists. Callers that need a fresh render should pass
   * a flag upstream (Round 29: `?fresh=true` on the portal route) so
   * this method only handles read-through cache hits.
   */
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
}
