-- V87 -- Billing PDF export cache (Phase 5.4 续, Round 29).
--
-- Round 18 wires the real `invoice` table to the pure-JS PDF generator
-- via BillingInvoicePdfService, but each portal request re-renders the
-- document from scratch even when the underlying invoice + metered
-- breakdown haven't changed. This table caches the rendered PDF bytes
-- keyed by invoice id so repeat downloads return the same bytes
-- instantly. Operators bust the cache by passing ?fresh=true on the
-- portal route (handled in BillingInvoicePdfService).
--
-- Schema mirrors the BillingPdfExport model in schema.prisma
-- (Bytes column for the raw PDF, sha256 for integrity verification,
-- createdAt for LRU-style eviction later).
CREATE TABLE IF NOT EXISTS "billing_pdf_export" (
    "id"          TEXT PRIMARY KEY,
    "invoice_id"  TEXT NOT NULL,
    "bytes"       BYTEA NOT NULL,
    "size"        INTEGER NOT NULL,
    "sha256"      TEXT NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "billing_pdf_export_invoice_id_created_at_idx"
    ON "billing_pdf_export"("invoice_id", "created_at");
