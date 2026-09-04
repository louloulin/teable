import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import type {
  IGetDepartmentListVo,
  IGetDepartmentUserVo,
  IOrganizationMeVo,
} from '@teable/openapi';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrganizationMe(userId: string): Promise<IOrganizationMeVo> {
    if (!userId) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedTime: null },
      select: { organizationId: true, isAdmin: true },
    });
    if (!user || !user.organizationId) return null;

    return {
      id: user.organizationId,
      name: user.organizationId,
      isAdmin: user.isAdmin ?? false,
    };
  }

  async getDepartmentUsers(): Promise<IGetDepartmentUserVo> {
    const total = await this.prisma.user.count({
      where: { deletedTime: null },
    });
    return { users: [], total };
  }

  async getDepartmentList(): Promise<IGetDepartmentListVo> {
    return [];
  }
}
