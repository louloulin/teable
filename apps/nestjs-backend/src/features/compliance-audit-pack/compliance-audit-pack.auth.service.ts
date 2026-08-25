/**
 * Compliance Audit Pack — NestJS auth service (Stage 124).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildAuditPack,
  controlToCsv,
  filterByFormat,
  formatBytes,
  hasAllFormats,
  isPackIdValid,
  manifestToText,
  renderControlsCsv,
  renderEvidenceJsonl,
  renderPdfManifest,
  sha256,
  verifyPackIntegrity,
} from './compliance-audit-pack.service';
import {
  AuditArtifact,
  AuditPack,
  AuditPackInput,
  ExportFormat,
  PdfManifestSection,
} from './compliance-audit-pack.types';
import { ControlItem } from '../compliance-control-map/compliance-control-map.types';
import { EvidenceRecord } from '../compliance-evidence-collector/compliance-evidence-collector.types';

@Injectable()
export class ComplianceAuditPackAuthService {
  constructor(private readonly prisma: PrismaService) {}

  toCsv(c: ControlItem): string { return controlToCsv(c); }
  csv(controls: readonly ControlItem[]): string { return renderControlsCsv(controls); }
  jsonl(records: readonly EvidenceRecord[]): string { return renderEvidenceJsonl(records); }
  manifest(input: { meta: AuditPack['meta']; controls: readonly ControlItem[]; records: readonly EvidenceRecord[] }): PdfManifestSection[] {
    return renderPdfManifest(input);
  }
  manifestText(sections: readonly PdfManifestSection[]): string { return manifestToText(sections); }
  hash(content: string): string { return sha256(content); }

  build(input: AuditPackInput): AuditPack {
    return buildAuditPack(input);
  }

  filter(pack: AuditPack, format: ExportFormat): AuditArtifact[] {
    return filterByFormat(pack, format);
  }

  verify(pack: AuditPack): boolean {
    return verifyPackIntegrity(pack);
  }

  validId(id: string): boolean {
    return isPackIdValid(id);
  }

  fmt(n: number): string {
    return formatBytes(n);
  }

  complete(pack: AuditPack): boolean {
    return hasAllFormats(pack);
  }

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}