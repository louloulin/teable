/**
 * Monthly billing PDF export — NestJS auth service spec (Stage 84).
 */

import { BillingPdfExportAuthService } from './billing-pdf-export.auth.service';

interface IPrismaMock {
  billingPdfExport: {
    create: (args: unknown) => Promise<unknown>;
    findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    billingPdfExport: {
      create: vi.fn().mockResolvedValue(undefined),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

describe('BillingPdfExportAuthService.storeExport', () => {
  it('persists bytes', async () => {
    const prisma = makePrisma();
    const svc = new BillingPdfExportAuthService(prisma as never);
    await svc.storeExport({
      invoiceId: 'inv_1',
      doc: { bytes: new Uint8Array([1, 2, 3]), size: 3, sha256: 'x'.repeat(64) },
    });
    expect(prisma.billingPdfExport.create).toHaveBeenCalledTimes(1);
  });
});

describe('BillingPdfExportAuthService.latestExport', () => {
  it('returns null when no export', async () => {
    const svc = new BillingPdfExportAuthService(makePrisma() as never);
    expect(await svc.latestExport('inv_1')).toBeNull();
  });
  it('returns bytes when present', async () => {
    const prisma = makePrisma();
    (prisma.billingPdfExport.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      bytes: Buffer.from('PDFDATA'),
      sha256: 'x'.repeat(64),
    });
    const svc = new BillingPdfExportAuthService(prisma as never);
    const out = await svc.latestExport('inv_1');
    expect(out).not.toBeNull();
    expect(out!.sha256.length).toBe(64);
  });
});

describe('BillingPdfExportAuthService helpers', () => {
  it('re-exports', () => {
    const svc = new BillingPdfExportAuthService(makePrisma() as never);
    expect(typeof svc.validateInvoice).toBe('function');
    expect(typeof svc.buildSummary).toBe('function');
    expect(typeof svc.formatCents).toBe('function');
    expect(typeof svc.paginateLines).toBe('function');
    expect(typeof svc.renderInvoicePdf).toBe('function');
  });
});
