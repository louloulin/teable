import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { coerceMode, decide, extractClientIp, parseCidr } from './ip-allowlist.service';
import type {
  IIpAllowlistDecision,
  IIpAllowlistEntry,
  IpAllowlistMode,
} from './ip-allowlist.types';

/**
 * IP allowlist orchestrator — Stage 25.
 *
 * Owns CRUD over `OrganizationIpAllowlist` and exposes the
 * `evaluate()` helper that the request middleware calls on every
 * request to decide whether to admit the source IP.
 */
@Injectable()
export class IpAllowlistAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Add a CIDR block to the allowlist. Throws on malformed input. */
  async add(input: {
    organizationId: string;
    cidr: string;
    mode?: IpAllowlistMode;
    note?: string;
    createdBy: string;
  }): Promise<IIpAllowlistEntry> {
    // Reject early so a bad row never lands.
    this.validateCidr(input.cidr);
    const id = `ipa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.organizationIpAllowlist.create({
      data: {
        id,
        organizationId: input.organizationId,
        cidr: input.cidr,
        mode: input.mode ?? 'block',
        note: input.note ?? null,
        createdBy: input.createdBy,
      },
    });
    return {
      id: row.id,
      organizationId: row.organizationId,
      cidr: row.cidr,
      mode: coerceMode(row.mode),
      note: row.note,
    };
  }

  /** Remove an entry by id; returns true when something was deleted. */
  async remove(input: { organizationId: string; id: string }): Promise<boolean> {
    const result = await this.prisma.organizationIpAllowlist.deleteMany({
      where: { id: input.id, organizationId: input.organizationId },
    });
    return result.count > 0;
  }

  /** List all entries for the org, sorted by cidr. */
  async list(organizationId: string): Promise<IIpAllowlistEntry[]> {
    const rows = await this.prisma.organizationIpAllowlist.findMany({
      where: { organizationId },
      orderBy: { cidr: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      cidr: r.cidr,
      mode: coerceMode(r.mode),
      note: r.note,
    }));
  }

  /**
   * Evaluate a request against the org's allowlist. When no entries
   * exist the decision is "allowed with no audit" so the middleware
   * stays inert until operators opt in.
   */
  async evaluate(input: {
    organizationId: string;
    headers: Record<string, string | undefined>;
    /** Optional fallback when no X-Forwarded-For / X-Real-IP header is present. */
    remoteAddress?: string;
  }): Promise<{ ip: string | null; decision: IIpAllowlistDecision }> {
    const ip = extractClientIp(input.headers) ?? input.remoteAddress ?? null;
    if (!ip) {
      // No IP visible — fail open. Operators MUST terminate behind a
      // trusted proxy that injects X-Forwarded-For.
      return {
        ip: null,
        decision: { allowed: true, blocked: false, audited: false, matchedEntryId: null },
      };
    }
    const entries = await this.list(input.organizationId);
    return { ip, decision: decide({ ip, entries }) };
  }

  /** Re-validate a CIDR + throw a friendly error message. */
  validateCidr(cidr: string): void {
    try {
      parseCidr(cidr);
    } catch (e) {
      throw new BadRequestException(`invalid CIDR: ${(e as Error).message}`);
    }
  }
}
