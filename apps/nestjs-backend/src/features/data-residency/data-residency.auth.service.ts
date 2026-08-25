import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildPolicyRow,
  buildRegionRow,
  isValidRegionCode,
  isValidStatusTransition,
  normalizeRegionFromHeader,
  parseRegionHeader,
  resolveRegionRoute,
} from './data-residency.service';
import type {
  IDataResidencyPolicy,
  IRegion,
  IResolvedRegionRoute,
  ISetPolicyInput,
  RegionStatus,
} from './data-residency.types';

@Injectable()
export class DataResidencyAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async createRegion(input: {
    code: string;
    displayName: string;
    status?: RegionStatus;
    dataCenterLocation?: string | null;
  }): Promise<IRegion> {
    if (!isValidRegionCode(input.code))
      throw new BadRequestException('region code must be 2 lowercase letters');
    if (!input.displayName) throw new BadRequestException('displayName is required');
    const existing = await this.prisma.region.findUnique({ where: { code: input.code } });
    if (existing) throw new ConflictException(`region exists: ${input.code}`);
    const id = `reg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildRegionRow({ id, ...input });
    const created = await this.prisma.region.create({
      data: {
        id: row.id,
        code: row.code,
        displayName: row.displayName,
        status: row.status,
        dataCenterLocation: row.dataCenterLocation,
      },
    });
    return toRegionRow(created);
  }

  async updateRegionStatus(code: string, status: RegionStatus): Promise<IRegion> {
    const existing = await this.prisma.region.findUnique({ where: { code } });
    if (!existing) throw new NotFoundException(`region not found: ${code}`);
    if (!isValidStatusTransition(existing.status as RegionStatus, status)) {
      throw new BadRequestException(`invalid status transition: ${existing.status} → ${status}`);
    }
    const updated = await this.prisma.region.update({ where: { code }, data: { status } });
    return toRegionRow(updated);
  }

  async getRegion(code: string): Promise<IRegion | null> {
    const row = await this.prisma.region.findUnique({ where: { code } });
    return row ? toRegionRow(row) : null;
  }

  async listRegions(): Promise<IRegion[]> {
    const rows = await this.prisma.region.findMany({ orderBy: { code: 'asc' } });
    return rows.map(toRegionRow);
  }

  async setPolicy(input: ISetPolicyInput): Promise<IDataResidencyPolicy> {
    if (!isValidRegionCode(input.regionCode)) throw new BadRequestException('invalid regionCode');
    const region = await this.prisma.region.findUnique({ where: { code: input.regionCode } });
    if (!region) throw new BadRequestException(`region does not exist: ${input.regionCode}`);
    if (region.status === 'offline') throw new BadRequestException('cannot pin to offline region');
    const existing = await this.prisma.dataResidencyPolicy.findUnique({
      where: { organizationId: input.organizationId },
    });
    if (existing) {
      if (existing.locked && existing.regionCode !== input.regionCode) {
        throw new BadRequestException('policy is locked; cannot change region');
      }
      const updated = await this.prisma.dataResidencyPolicy.update({
        where: { organizationId: input.organizationId },
        data: { regionCode: input.regionCode, locked: input.locked, updatedBy: input.updatedBy },
      });
      return toPolicyRow(updated);
    }
    const id = `pol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildPolicyRow({ id, ...input });
    const created = await this.prisma.dataResidencyPolicy.create({
      data: {
        id: row.id,
        organizationId: row.organizationId,
        regionCode: row.regionCode,
        locked: row.locked,
        updatedBy: row.updatedBy,
      },
    });
    return toPolicyRow(created);
  }

  async getPolicy(organizationId: string): Promise<IDataResidencyPolicy | null> {
    const row = await this.prisma.dataResidencyPolicy.findUnique({ where: { organizationId } });
    return row ? toPolicyRow(row) : null;
  }

  async deletePolicy(organizationId: string): Promise<boolean> {
    const existing = await this.prisma.dataResidencyPolicy.findUnique({
      where: { organizationId },
    });
    if (!existing) return false;
    if (existing.locked) throw new BadRequestException('cannot delete a locked policy');
    await this.prisma.dataResidencyPolicy.delete({ where: { organizationId } });
    return true;
  }

  /** Compute whether the caller is allowed to access data via the given request region. */
  async authorizeRequest(input: {
    organizationId: string;
    headers: Record<string, string | string[] | undefined> | null | undefined;
  }): Promise<IResolvedRegionRoute> {
    const headerRaw = parseRegionHeader(input.headers);
    const requestRegion = normalizeRegionFromHeader(headerRaw);
    const policy = await this.getPolicy(input.organizationId);
    let targetRegion: IRegion | null = null;
    if (requestRegion && requestRegion !== policy?.regionCode) {
      targetRegion = await this.getRegion(requestRegion);
    }
    return resolveRegionRoute({ requestRegion, policy, targetRegion });
  }
}

function toRegionRow(r: {
  id: string;
  code: string;
  displayName: string;
  status: string;
  dataCenterLocation: string | null;
  createdTime: Date;
  updatedTime: Date;
}): IRegion {
  return {
    id: r.id,
    code: r.code,
    displayName: r.displayName,
    status: r.status as IRegion['status'],
    dataCenterLocation: r.dataCenterLocation,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}

function toPolicyRow(r: {
  id: string;
  organizationId: string;
  regionCode: string;
  locked: boolean;
  updatedBy: string;
  updatedTime: Date;
}): IDataResidencyPolicy {
  return {
    id: r.id,
    organizationId: r.organizationId,
    regionCode: r.regionCode,
    locked: r.locked,
    updatedBy: r.updatedBy,
    updatedTime: r.updatedTime,
  };
}

export { resolveRegionRoute, parseRegionHeader, normalizeRegionFromHeader, isValidRegionCode };
