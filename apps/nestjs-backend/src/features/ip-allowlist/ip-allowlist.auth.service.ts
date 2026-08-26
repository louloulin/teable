/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * IP allowlist — NestJS thin-DI auth service (Stage N).
 *
 * Auth-only entry point for the IP-allowlist feature. Loads the active
 * allowlist rows from `setting` and returns the evaluation result. The
 * full middleware enforcement stays in `ip-allowlist.middleware.ts`.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { evaluateAllowlist } from './ip-allowlist.helpers';
import type { IAllowlistCheck, IAllowlistEntry } from './ip-allowlist.types';

const settingKey = 'ip_allowlist';

@Injectable()
export class IpAllowlistAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async loadAllowlist(): Promise<IAllowlistEntry[]> {
    const row = await this.prisma.setting.findFirst({
      where: { name: settingKey },
    });
    if (!row) return [];
    try {
      const parsed = JSON.parse(row.value as unknown as string) as IAllowlistEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async check(ip: string): Promise<IAllowlistCheck> {
    const entries = await this.loadAllowlist();
    return evaluateAllowlist(ip, entries);
  }
}