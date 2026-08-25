/**
 * Audit log export + SIEM forwarding — Stage 24 types.
 *
 * Pure data carriers for the export/forward pipeline. Keeping these
 * separate from the controller lets us unit-test the CSV / JSON
 * serialization and HMAC signing without spinning up HTTP.
 */

export type AuditExportFormat = 'csv' | 'json' | 'jsonl';

export interface IAuditEventRow {
  id: string;
  organizationId: string | null;
  actorId: string | null;
  action: string;
  detail: unknown;
  ipAddress: string | null;
  requestId: string | null;
  createdTime: Date;
}

export interface IAuditExportInput {
  events: IAuditEventRow[];
  format: AuditExportFormat;
  /** Inclusive lower bound on `createdTime`. */
  from?: Date;
  /** Inclusive upper bound on `createdTime`. */
  to?: Date;
}

export interface IAuditExportResult {
  body: string;
  mimeType: string;
  filename: string;
  rowCount: number;
}

export interface ISiemWebhookInput {
  id: string;
  organizationId: string;
  label: string;
  url: string;
  /** Plaintext shared secret. The DB row stores plaintext for Stage 24 — see note below. */
  secret: string;
  enabled: boolean;
  actions: string[];
}

export interface ISiemDeliverInput {
  webhook: ISiemWebhookInput;
  events: IAuditEventRow[];
  /**
   * Inject to avoid pulling `fetch` into the service tests. Production
   * code uses the default (global `fetch`).
   */
  transport?: (input: {
    url: string;
    body: string;
    headers: Record<string, string>;
  }) => Promise<{ ok: boolean; status: number }>;
}
