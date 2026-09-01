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

  async persist(pack: AuditPack, createdBy?: string): Promise<AuditPack> {
    await this.prisma.complianceAuditPack.upsert({
      where: { id: pack.meta.packId },
      create: {
        id: pack.meta.packId,
        framework: pack.meta.framework,
        periodFrom: pack.meta.periodFrom,
        periodTo: pack.meta.periodTo,
        generatedAt: new Date(pack.meta.generatedAt),
        contentHash: pack.meta.contentHash,
        totalBytes: pack.meta.totalBytes,
        artifactCount: pack.meta.artifactCount,
        artifacts: JSON.parse(JSON.stringify(pack.artifacts)) as any,
        createdBy: createdBy ?? null,
      },
      update: {
        framework: pack.meta.framework,
        periodFrom: pack.meta.periodFrom,
        periodTo: pack.meta.periodTo,
        generatedAt: new Date(pack.meta.generatedAt),
        contentHash: pack.meta.contentHash,
        totalBytes: pack.meta.totalBytes,
        artifactCount: pack.meta.artifactCount,
        artifacts: JSON.parse(JSON.stringify(pack.artifacts)) as any,
      },
    });
    return pack;
  }

  async listPersisted() {
    return this.prisma.complianceAuditPack.findMany({
      select: {
        id: true,
        framework: true,
        periodFrom: true,
        periodTo: true,
        generatedAt: true,
        contentHash: true,
        totalBytes: true,
        artifactCount: true,
        createdBy: true,
        createdTime: true,
      },
      orderBy: { createdTime: 'desc' },
    });
  }

  async getPersisted(id: string): Promise<AuditPack | null> {
    const row = await this.prisma.complianceAuditPack.findUnique({ where: { id } });
    if (!row) return null;
    return {
      meta: {
        packId: row.id,
        generatedAt: row.generatedAt.toISOString(),
        framework: row.framework as AuditPack['meta']['framework'],
        periodFrom: row.periodFrom,
        periodTo: row.periodTo,
        contentHash: row.contentHash,
        totalBytes: row.totalBytes,
        artifactCount: row.artifactCount,
      },
      artifacts: row.artifacts as unknown as AuditPack['artifacts'],
    };
  }

  async countPersisted(): Promise<number> {
    return this.prisma.complianceAuditPack.count();
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
