/**
 * Compliance Attestation — NestJS auth service (Stage 125).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  daysUntilExpiry,
  expireOverdue,
  filterByKind,
  filterByRef,
  findActive,
  hashStatement,
  isActive,
  isAttestationIdValid,
  isStatementValid,
  needsReAttestation,
  rejectAttestation,
  submitAttestation,
  summarize,
  verifyAttestation,
} from './compliance-attestation.service';
import {
  Attestation,
  AttestationKind,
  AttestationPolicy,
  AttestationReport,
  AttestationRequest,
} from './compliance-attestation.types';

@Injectable()
export class ComplianceAttestationAuthService {
  constructor(private readonly prisma: PrismaService) {}

  hash(s: string): string { return hashStatement(s); }
  validId(id: string): boolean { return isAttestationIdValid(id); }
  validStatement(s: string): boolean { return isStatementValid(s); }

  submit(req: AttestationRequest, now?: string): Attestation { return submitAttestation(req, now); }
  verify(att: Attestation, verifier: string, now?: string): Attestation { return verifyAttestation(att, verifier, now); }
  reject(att: Attestation, reason: string, now?: string): Attestation { return rejectAttestation(att, reason, now); }

  active(att: Attestation, now?: string): boolean { return isActive(att, now); }
  byKind(atts: readonly Attestation[], kind: AttestationKind): Attestation[] { return filterByKind(atts, kind); }
  byRef(atts: readonly Attestation[], refId: string): Attestation[] { return filterByRef(atts, refId); }
  current(atts: readonly Attestation[], refId: string, now?: string): Attestation | undefined { return findActive(atts, refId, now); }

  report(atts: readonly Attestation[], now?: string): AttestationReport { return summarize(atts, now); }
  needs(atts: readonly Attestation[], refId: string, policy: AttestationPolicy, now?: string): boolean { return needsReAttestation(atts, refId, policy, now); }
  expire(atts: readonly Attestation[], now?: string): Attestation[] { return expireOverdue(atts, now); }
  days(att: Attestation, now?: string): number { return daysUntilExpiry(att, now); }

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}