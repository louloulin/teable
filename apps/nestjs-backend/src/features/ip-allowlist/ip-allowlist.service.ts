/* eslint-disable @typescript-eslint/naming-convention */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

export interface IIpAllowlistEntry {
  id: string;
  // Single IPv4 / IPv6 literal OR CIDR (e.g. "10.0.0.0/8"). The middleware
  // matches `ip` against exact entries first, then against CIDR ranges.
  cidr: string;
  // Human-readable note surfaced in admin UIs ("office NAT", "ci-runner", ...)
  description?: string;
  createdTime: string;
}

const SETTING_KEY = 'security.ip_allowlist';

interface IStoredAllowlist {
  entries: IIpAllowlistEntry[];
}

const emptyAllowlist: IStoredAllowlist = { entries: [] };

/**
 * Persists the IP allowlist in the `setting` table as JSON content under a
 * dedicated key. Picked here over a dedicated table because the allowlist is
 * instance-global state (not per-space) and read on EVERY request by the
 * middleware — a JSON blob of a few hundred entries is faster to load than a
 * row scan, and the write frequency is essentially zero.
 *
 * Public surface is intentionally tiny: list/get/create/delete. The middleware
 * calls `getEntries()` on the hot path; the controller calls the rest.
 */
@Injectable()
export class IpAllowlistService {
  private readonly logger = new Logger(IpAllowlistService.name);

  constructor(private readonly prismaService: PrismaService) {}

  private async load(): Promise<IStoredAllowlist> {
    const row = await this.prismaService.setting.findUnique({
      where: { name: SETTING_KEY },
      select: { content: true },
    });
    if (!row?.content) return emptyAllowlist;
    try {
      const parsed = JSON.parse(row.content) as Partial<IStoredAllowlist>;
      const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      return { entries };
    } catch (error) {
      this.logger.warn(
        `[ip-allowlist] malformed stored allowlist (${error instanceof Error ? error.message : String(error)}); treating as empty`
      );
      return emptyAllowlist;
    }
  }

  private async save(value: IStoredAllowlist, userId?: string): Promise<void> {
    const user = userId ?? 'system';
    await this.prismaService.setting.upsert({
      where: { name: SETTING_KEY },
      create: {
        name: SETTING_KEY,
        content: JSON.stringify(value),
        createdBy: user,
      },
      update: {
        content: JSON.stringify(value),
        lastModifiedBy: user,
      },
    });
  }

  async getEntries(): Promise<IIpAllowlistEntry[]> {
    const stored = await this.load();
    return stored.entries;
  }

  async addEntry(input: { cidr: string; description?: string }, userId?: string): Promise<IIpAllowlistEntry> {
    const entry: IIpAllowlistEntry = {
      id: `ip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      cidr: input.cidr,
      description: input.description,
      createdTime: new Date().toISOString(),
    };
    const stored = await this.load();
    stored.entries.push(entry);
    await this.save(stored, userId);
    return entry;
  }

  async removeEntry(id: string, userId?: string): Promise<boolean> {
    const stored = await this.load();
    const next = stored.entries.filter((e) => e.id !== id);
    if (next.length === stored.entries.length) return false;
    await this.save({ entries: next }, userId);
    return true;
  }

  /**
   * Hot-path match. Returns true when the IP is in the allowlist OR when the
   * allowlist is empty (fail-open for fresh installs — an empty list does NOT
   * lock everyone out; the admin has to opt in to enforcement).
   */
  async isAllowed(ip: string): Promise<boolean> {
    const entries = await this.getEntries();
    if (entries.length === 0) return true;
    return entries.some((entry) => matchCidr(ip, entry.cidr));
  }
}

const ipv4CidrMatch = (ip: string, cidr: string): boolean => {
  if (!ip.includes('.') || !cidr.includes('/')) return false;
  const [net, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  if (!Number.isFinite(bits) || bits < 0 || bits > 32) return false;
  const ipParts = ip.split('.').map(Number);
  const netParts = net.split('.').map(Number);
  if (ipParts.length !== 4 || netParts.length !== 4) return false;
  if (ipParts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return false;
  if (netParts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  const ipNum =
    ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
  const netNum =
    ((netParts[0] << 24) | (netParts[1] << 16) | (netParts[2] << 8) | netParts[3]) >>> 0;
  return (ipNum & mask) === (netNum & mask);
};

const ipv6ExactMatch = (ip: string, entry: string): boolean => {
  if (entry.includes('/')) return false;
  return ip.toLowerCase() === entry.toLowerCase();
};

const matchCidr = (ip: string, cidr: string): boolean => {
  if (!ip || !cidr) return false;
  if (cidr.includes('/')) return ipv4CidrMatch(ip, cidr);
  return ipv6ExactMatch(ip, cidr);
};
