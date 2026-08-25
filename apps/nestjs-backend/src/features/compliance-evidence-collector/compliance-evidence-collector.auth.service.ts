/**
 * Compliance Evidence Collector — NestJS auth service (Stage 123).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildEvidenceId,
  collectEvidence,
  dropStale,
  filterRecords,
  groupByControl,
  hashContent,
  isEvidenceIdValid,
  isFresh,
  presentEvidence,
  totals,
} from './compliance-evidence-collector.service';
import {
  CollectionResult,
  EvidenceCollectorOptions,
  EvidenceQuery,
  EvidenceRecord,
} from './compliance-evidence-collector.types';
import { EvidenceKind } from '../compliance-control-map/compliance-control-map.types';

@Injectable()
export class ComplianceEvidenceCollectorAuthService {
  constructor(private readonly prisma: PrismaService) {}

  buildId(controlId: string, kind: string, contentHash: string): string {
    return buildEvidenceId(controlId, kind, contentHash);
  }

  hash(content: string | Uint8Array): string {
    return hashContent(content);
  }

  validId(id: string): boolean {
    return isEvidenceIdValid(id);
  }

  collect(input: {
    candidates: readonly { controlId: string; kind: EvidenceRecord['kind']; content: string | Uint8Array; source: string; collectedAt?: string }[];
    options?: EvidenceCollectorOptions;
    now?: string;
  }): CollectionResult {
    return collectEvidence(input);
  }

  filter(records: readonly EvidenceRecord[], query: EvidenceQuery): EvidenceRecord[] {
    return filterRecords(records, query);
  }

  group(records: readonly EvidenceRecord[]): Record<string, EvidenceRecord[]> {
    return groupByControl(records);
  }

  present(records: readonly EvidenceRecord[]): Map<string, Set<EvidenceKind>> {
    return presentEvidence(records);
  }

  sum(records: readonly EvidenceRecord[]) {
    return totals(records);
  }

  fresh(record: EvidenceRecord, now?: string): boolean {
    return isFresh(record, now);
  }

  drop(records: readonly EvidenceRecord[], now: string): EvidenceRecord[] {
    return dropStale(records, now);
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