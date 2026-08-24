import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import type { IClsStore } from '../../types/cls';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { PermissionMatrixService } from './permission-matrix.service';
import {
  PERMISSION_MATRIX_CAPABILITY,
  PermissionFilter,
} from './permission-matrix.constants';

const MatrixGuard = LicenseCapabilityGuard.for(PERMISSION_MATRIX_CAPABILITY);

interface ICreateRoleDto {
  baseId: string;
  name: string;
  description?: string;
}

interface ITableAccessDto {
  tableId: string;
  access: 'none' | 'editable';
}

interface IFieldPermissionDto {
  tableId: string;
  fieldId: string;
  access: 'hidden' | 'readonly' | 'editable';
}

interface IRecordActionDto {
  tableId: string;
  action: 'view' | 'update' | 'create' | 'delete' | 'comment';
  enabled: boolean;
}

interface IRecordFilterDto {
  tableId: string;
  filter: PermissionFilter | null;
}

interface IAddMemberDto {
  baseId: string;
  roleId: string;
  userId: string;
}

@Controller('api/admin/permission-matrix')
@UseGuards(MatrixGuard)
export class PermissionMatrixController {
  constructor(
    private readonly svc: PermissionMatrixService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @Post('roles')
  async create(@Body() body: ICreateRoleDto) {
    const userId = this.cls.get('user')?.id ?? 'system';
    return this.svc.createRole({
      baseId: body.baseId,
      name: body.name,
      description: body.description,
      createdBy: userId,
    });
  }

  @Get('roles')
  async list(@Query('baseId') baseId: string) {
    return this.svc.listRoles(baseId);
  }

  @Delete('roles/:roleId')
  async delete(@Param('roleId') roleId: string, @Query('baseId') baseId: string) {
    await this.svc.deleteRole(baseId, roleId);
    return { ok: true };
  }

  @Put('roles/:roleId/enabled')
  async setEnabled(
    @Param('roleId') roleId: string,
    @Query('baseId') baseId: string,
    @Body() body: { enabled: boolean }
  ) {
    return this.svc.setRoleEnabled(baseId, roleId, body.enabled);
  }

  @Put('roles/:roleId/table-access')
  async setTableAccess(
    @Param('roleId') roleId: string,
    @Query('baseId') baseId: string,
    @Body() body: ITableAccessDto
  ) {
    await this.svc.setTableAccess(baseId, roleId, body.tableId, body.access);
    return { ok: true };
  }

  @Put('roles/:roleId/field-permission')
  async setFieldPermission(
    @Param('roleId') roleId: string,
    @Query('baseId') baseId: string,
    @Body() body: IFieldPermissionDto
  ) {
    await this.svc.setFieldPermission(baseId, roleId, body.tableId, body.fieldId, body.access);
    return { ok: true };
  }

  @Put('roles/:roleId/record-action')
  async setRecordAction(
    @Param('roleId') roleId: string,
    @Query('baseId') baseId: string,
    @Body() body: IRecordActionDto
  ) {
    await this.svc.setRecordAction(baseId, roleId, body.tableId, body.action, body.enabled);
    return { ok: true };
  }

  @Put('roles/:roleId/record-filter')
  async setRecordFilter(
    @Param('roleId') roleId: string,
    @Query('baseId') baseId: string,
    @Body() body: IRecordFilterDto
  ) {
    await this.svc.setRecordFilter(baseId, roleId, body.tableId, body.filter);
    return { ok: true };
  }

  @Post('members')
  async addMember(@Body() body: IAddMemberDto) {
    await this.svc.addMember(body.baseId, body.roleId, body.userId);
    return { ok: true };
  }

  @Delete('members')
  async removeMember(@Body() body: IAddMemberDto) {
    await this.svc.removeMember(body.baseId, body.roleId, body.userId);
    return { ok: true };
  }
}
