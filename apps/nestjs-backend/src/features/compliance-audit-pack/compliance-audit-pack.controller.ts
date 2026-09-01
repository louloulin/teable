/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Compliance Audit Pack — admin endpoints (under `/api/admin/compliance-audit-pack/*`).
 *
 * Generates and persists an audit pack from control + evidence inputs and
 * exposes query endpoints for the admin panel. Gated by the `admin_panel`
 * LicenseCapabilityGuard so the surface is paid-tier when licensed, falls
 * through to OSS in self-hosted mode.
 *
 * Artifact bodies are persisted in the database JSON payload for now, while
 * the API remains compatible with a future object-storage backend.
 */
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { ComplianceAuditPackAuthService } from './compliance-audit-pack.auth.service';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

@Controller('api/admin/compliance-audit-pack')
@UseGuards(AdminGuard)
export class ComplianceAuditPackController {
  constructor(private readonly svc: ComplianceAuditPackAuthService) {}

  @Post('generate')
  async generate(
    @Body()
    body: {
      controls: Parameters<ComplianceAuditPackAuthService['build']>[0]['controls'];
      records: Parameters<ComplianceAuditPackAuthService['build']>[0]['records'];
      generatedAt?: string;
    }
  ) {
    const pack = this.svc.build({
      controls: body.controls,
      records: body.records,
      generatedAt: body.generatedAt,
    });
    await this.svc.persist(pack, 'usr_admin');
    return {
      packId: pack.meta.packId,
      generatedAt: pack.meta.generatedAt,
      framework: pack.meta.framework,
      periodFrom: pack.meta.periodFrom,
      periodTo: pack.meta.periodTo,
      contentHash: pack.meta.contentHash,
      totalBytes: pack.meta.totalBytes,
      artifactCount: pack.meta.artifactCount,
      artifacts: pack.artifacts.map((a) => ({
        filename: a.filename,
        format: a.format,
        bytes: a.bytes,
        contentHash: a.contentHash,
      })),
    };
  }

  @Get('list')
  async list() {
    const packs = await this.svc.listPersisted();
    return {
      total: packs.length,
      packs,
      formats: ['pdf', 'csv', 'jsonl'] as const,
    };
  }

  @Get('count')
  async count() {
    return { total: await this.svc.countPersisted() };
  }

  @Get('status')
  async status() {
    const ok = await this.svc.ping();
    return { ok };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const pack = await this.svc.getPersisted(id);
    if (!pack) throw new NotFoundException(`audit pack not found: ${id}`);
    return pack;
  }

}
