/**
 * Compliance Control Map — NestJS auth service (Stage 122).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  BUILTIN_CONTROLS,
  buildControlMap,
  coveragePercent,
  filterByCategory,
  filterByFramework,
  findMissingEvidence,
  hashMap,
  isControlIdValid,
  requirementsFor,
  serializeMap,
  updateStatus,
} from './compliance-control-map.service';
import {
  ControlCategory,
  ControlCoverageReport,
  ControlFramework,
  ControlItem,
  ControlMapEntry,
  ControlStatus,
  EvidenceKind,
  EvidenceRequirement,
} from './compliance-control-map.types';

@Injectable()
export class ComplianceControlMapAuthService {
  constructor(private readonly prisma: PrismaService) {}

  library(): readonly ControlItem[] {
    return BUILTIN_CONTROLS;
  }

  build(extra: readonly ControlItem[] = []): readonly ControlMapEntry[] {
    return buildControlMap(extra);
  }

  byFramework(entries: readonly ControlMapEntry[], framework: ControlFramework): readonly ControlMapEntry[] {
    return filterByFramework(entries, framework);
  }

  byCategory(entries: readonly ControlMapEntry[], category: ControlCategory): readonly ControlMapEntry[] {
    return filterByCategory(entries, category);
  }

  reqs(control: ControlItem): readonly EvidenceRequirement[] {
    return requirementsFor(control);
  }

  update(control: ControlItem, status: ControlStatus, updatedAt: string): ControlItem {
    return updateStatus(control, status, updatedAt);
  }

  validId(id: string): boolean {
    return isControlIdValid(id);
  }

  missing(entries: readonly ControlMapEntry[], hasEvidence: ReadonlyMap<string, Set<EvidenceKind>>): ControlCoverageReport {
    return findMissingEvidence(entries, hasEvidence);
  }

  percent(report: ControlCoverageReport): number {
    return coveragePercent(report);
  }

  serialize(entries: readonly ControlMapEntry[]): string {
    return serializeMap(entries);
  }

  hash(entries: readonly ControlMapEntry[]): string {
    return hashMap(entries);
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