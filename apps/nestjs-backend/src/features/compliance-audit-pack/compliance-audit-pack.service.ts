/**
 * Compliance Audit Pack — pure helpers (Stage 124).
 */

import { createHash } from 'node:crypto';

import {
  AuditArtifact,
  AuditPack,
  AuditPackInput,
  AuditPackMeta,
  EXPORT_FORMATS,
  ExportFormat,
  PdfManifestSection,
} from './compliance-audit-pack.types';
import { ControlItem } from '../compliance-control-map/compliance-control-map.types';
import { EvidenceRecord } from '../compliance-evidence-collector/compliance-evidence-collector.types';

/** Render a control as a one-line CSV row. */
export function controlToCsv(c: ControlItem): string {
  return [
    escape(c.id),
    escape(c.framework),
    escape(c.category),
    escape(c.status),
    escape(c.title),
    escape(c.description),
    c.evidence.map(escape).join('|'),
    c.updatedAt ?? '',
  ].join(',');
}

function escape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Header for the controls CSV. */
export const CONTROL_CSV_HEADER = 'id,framework,category,status,title,description,evidence,updatedAt';

/** Render controls as CSV. */
export function renderControlsCsv(controls: readonly ControlItem[]): string {
  return [CONTROL_CSV_HEADER, ...controls.map(controlToCsv)].join('\n') + '\n';
}

/** Render evidence as JSONL (one record per line). */
export function renderEvidenceJsonl(records: readonly EvidenceRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
}

/** Build a printable PDF manifest body (text-only, plain text approximation). */
export function renderPdfManifest(input: {
  meta: AuditPackMeta;
  controls: readonly ControlItem[];
  records: readonly EvidenceRecord[];
}): PdfManifestSection[] {
  const attested = input.controls.filter((c) => c.status === 'attested').length;
  const verified = input.controls.filter((c) => c.status === 'verified').length;
  const sections: PdfManifestSection[] = [
    { title: 'Pack Summary', body: `Pack: ${input.meta.packId}\nGenerated: ${input.meta.generatedAt}\nFramework: ${input.meta.framework}\nPeriod: ${input.meta.periodFrom} → ${input.meta.periodTo}` },
    { title: 'Control Coverage', body: `Total: ${input.controls.length}\nAttested: ${attested}\nVerified: ${verified}` },
    { title: 'Evidence', body: `Records: ${input.records.length}` },
    { title: 'Controls', body: input.controls.map((c) => `- ${c.id} ${c.framework}/${c.category}: ${c.status} — ${c.title}`).join('\n') },
  ];
  return sections;
}

/** Serialize a manifest to plain-text body. */
export function manifestToText(sections: readonly PdfManifestSection[]): string {
  return sections.map((s) => `=== ${s.title} ===\n${s.body}\n`).join('\n');
}

/** Compute SHA-256 hex. */
export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Build the full audit pack from input. */
export function buildAuditPack(input: AuditPackInput): AuditPack {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const controlsCsv = renderControlsCsv(input.controls);
  const jsonl = renderEvidenceJsonl(input.records);
  const framework = deriveFramework(input.controls);
  const period = derivePeriod(input.records, generatedAt);
  const sections = renderPdfManifest({
    meta: { packId: 'pending', generatedAt, framework, periodFrom: period.from, periodTo: period.to, contentHash: '', totalBytes: 0, artifactCount: 0 },
    controls: input.controls,
    records: input.records,
  });
  const pdfBody = manifestToText(sections);
  const artifacts: AuditArtifact[] = [
    { filename: 'controls.csv', format: 'csv', bytes: Buffer.byteLength(controlsCsv), content: controlsCsv, contentHash: sha256(controlsCsv) },
    { filename: 'evidence.jsonl', format: 'jsonl', bytes: Buffer.byteLength(jsonl), content: jsonl, contentHash: sha256(jsonl) },
    { filename: 'manifest.pdf', format: 'pdf', bytes: Buffer.byteLength(pdfBody), content: pdfBody, contentHash: sha256(pdfBody) },
  ];
  const totalBytes = artifacts.reduce((s, a) => s + a.bytes, 0);
  const combined = artifacts.map((a) => a.contentHash).join('|');
  const contentHash = sha256(combined);
  const packId = `pack_${contentHash.slice(0, 8)}`;
  const meta: AuditPackMeta = {
    packId,
    generatedAt,
    framework,
    periodFrom: period.from,
    periodTo: period.to,
    contentHash,
    totalBytes,
    artifactCount: artifacts.length,
  };
  return { meta, artifacts };
}

function deriveFramework(controls: readonly ControlItem[]): AuditPackMeta['framework'] {
  const frameworks = new Set(controls.map((c) => c.framework));
  if (frameworks.size > 1) return 'MIXED';
  if (frameworks.size === 1) return [...frameworks][0];
  return 'MIXED';
}

function derivePeriod(records: readonly EvidenceRecord[], fallback: string): { from: string; to: string } {
  if (!records.length) return { from: fallback, to: fallback };
  const dates = records.map((r) => r.collectedAt).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

/** Filter pack artifacts to a single format. */
export function filterByFormat(pack: AuditPack, format: ExportFormat): AuditArtifact[] {
  return pack.artifacts.filter((a) => a.format === format);
}

/** Verify pack content hash matches artifacts. */
export function verifyPackIntegrity(pack: AuditPack): boolean {
  const combined = pack.artifacts.map((a) => a.contentHash).join('|');
  const expected = sha256(combined);
  return expected === pack.meta.contentHash;
}

/** Validate pack id format. */
export function isPackIdValid(id: string): boolean {
  return /^pack_[a-f0-9]{8,}$/.test(id);
}

/** Format bytes for display. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(2)}MB`;
}

/** Check that all formats are present. */
export function hasAllFormats(pack: AuditPack): boolean {
  const set = new Set(pack.artifacts.map((a) => a.format));
  return EXPORT_FORMATS.every((f) => set.has(f));
}