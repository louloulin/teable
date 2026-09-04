import { Controller, Get } from '@nestjs/common';
import type {
  IGetDepartmentListVo,
  IGetDepartmentUserVo,
  IOrganizationMeVo,
} from '@teable/openapi';
import { OrganizationService } from './organization.service';

@Controller('api/organization')
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  @Get('me')
  async getOrganizationMe(): Promise<IOrganizationMeVo> {
    return this.service.getOrganizationMe('anonymous');
  }

  @Get('department-user')
  async getDepartmentUsers(): Promise<IGetDepartmentUserVo> {
    return this.service.getDepartmentUsers();
  }

  @Get('department')
  async getDepartmentList(): Promise<IGetDepartmentListVo> {
    return this.service.getDepartmentList();
  }
}
