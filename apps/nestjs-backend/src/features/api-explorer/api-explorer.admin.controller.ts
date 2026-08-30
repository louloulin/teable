import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { ApiExplorerAuthService } from './api-explorer.auth.service';

const ApiExplorerAdminGuard = LicenseCapabilityGuard.for('admin_panel');

@Controller('api/admin/api-explorer')
@UseGuards(ApiExplorerAdminGuard)
@Permissions('instance|read')
export class ApiExplorerAdminController {
  constructor(private readonly service: ApiExplorerAuthService) {}

  @Get('openapi.json')
  @Header('Content-Type', 'application/json')
  async openapiJson() {
    return this.service.getOpenApiJson();
  }

  @Get('spec')
  @Header('Content-Type', 'application/json')
  async spec() {
    return this.service.getSpec();
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async explorer() {
    return this.service.getExplorerHtml();
  }
}
