/**
 * Compliance Audit Pack — types (Stage 124).
 *
 * Generates a one-click exportable audit pack: PDF manifest + CSV inventory + JSONL records.
 */

import { ControlItem } from '../compliance-control-map/compliance-control-map.types';
import { EvidenceRecord } from '../compliance-evidence-collector/compliance-evidence-collector.types';

export type ExportFormat = 'pdf' | 'csv' | 'jsonl';

export interface AuditPackMeta {
  /** Pack id (e.g. pack_<hash>). */
  packId: string;
  /** ISO timestamp when generated. */
  generatedAt: string;
  /** Framework scope (SOC2 / ISO27001 / MIXED). */
  framework: 'SOC2' | 'ISO27001' | 'MIXED';
  /** Period covered. */
  periodFrom: string;
  periodTo: string;
  /** SHA-256 of the pack content. */
  contentHash: string;
  /** Size of all artifacts combined. */
  totalBytes: number;
  /** Number of artifacts. */
  artifactCount: number;
}

export interface AuditArtifact {
  /** Artifact filename (within pack). */
  filename: string;
  /** Format / mime. */
  format: ExportFormat;
  /** Byte length. */
  bytes: number;
  /** Content body (string). */
  content: string;
  /** SHA-256 of content. */
  contentHash: string;
}

export interface AuditPack {
  meta: AuditPackMeta;
  artifacts: readonly AuditArtifact[];
}

export interface AuditPackInput {
  controls: readonly ControlItem[];
  records: readonly EvidenceRecord[];
  generatedAt?: string;
  periodFrom?: string;
  periodTo?: string;
}

export interface PdfManifestSection {
  title: string;
  body: string;
}

export const AUDIT_PACK_ID_RE = /^pack_[a-f0-9]{8,}$/;
export const EXPORT_FORMATS: readonly ExportFormat[] = ['pdf', 'csv', 'jsonl'];