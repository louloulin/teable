import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import type { IClsStore } from '../../types/cls';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ResourceMeta } from '../auth/decorators/resource_meta.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { PERMISSION_MATRIX_CAPABILITY, PermissionFilter } from './permission-matrix.constants';
import { PermissionMatrixService } from './permission-matrix.service';

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

interface IAppAccessDto {
  baseId: string;
  appId: string;
  access: 'none' | 'accessible' | 'editable';
}

interface IWorkflowAccessDto {
  baseId: string;
  workflowId: string;
  access: 'none' | 'accessible' | 'editable';
}

interface IDefaultRoleDto {
  baseId: string;
  roleId: string | null;
}

interface IImportExportDto {
  baseId: string;
  tableId: string;
  canImport: boolean;
  canExport: boolean;
}

@Controller('api/admin/permission-matrix')
@UseGuards(MatrixGuard)
export class PermissionMatrixController {
  constructor(
    private readonly svc: PermissionMatrixService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @Post('roles')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'body')
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
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'query')
  async list(@Query('baseId') baseId: string) {
    return this.svc.listRoles(baseId);
  }

  @Delete('roles/:roleId')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'query')
  async delete(@Param('roleId') roleId: string, @Query('baseId') baseId: string) {
    await this.svc.deleteRole(baseId, roleId);
    return { ok: true };
  }

  @Put('roles/:roleId/enabled')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'query')
  async setEnabled(
    @Param('roleId') roleId: string,
    @Query('baseId') baseId: string,
    @Body() body: { enabled: boolean }
  ) {
    return this.svc.setRoleEnabled(baseId, roleId, body.enabled);
  }

  @Put('roles/:roleId/table-access')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'query')
  async setTableAccess(
    @Param('roleId') roleId: string,
    @Query('baseId') baseId: string,
    @Body() body: ITableAccessDto
  ) {
    await this.svc.setTableAccess(baseId, roleId, body.tableId, body.access);
    return { ok: true };
  }

  @Put('roles/:roleId/field-permission')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'query')
  async setFieldPermission(
    @Param('roleId') roleId: string,
    @Query('baseId') baseId: string,
    @Body() body: IFieldPermissionDto
  ) {
    await this.svc.setFieldPermission(baseId, roleId, body.tableId, body.fieldId, body.access);
    return { ok: true };
  }

  @Put('roles/:roleId/record-action')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'query')
  async setRecordAction(
    @Param('roleId') roleId: string,
    @Query('baseId') baseId: string,
    @Body() body: IRecordActionDto
  ) {
    await this.svc.setRecordAction(baseId, roleId, body.tableId, body.action, body.enabled);
    return { ok: true };
  }

  @Put('roles/:roleId/record-filter')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'query')
  async setRecordFilter(
    @Param('roleId') roleId: string,
    @Query('baseId') baseId: string,
    @Body() body: IRecordFilterDto
  ) {
    await this.svc.setRecordFilter(baseId, roleId, body.tableId, body.filter);
    return { ok: true };
  }

  @Post('members')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'body')
  async addMember(@Body() body: IAddMemberDto) {
    await this.svc.addMember(body.baseId, body.roleId, body.userId);
    return { ok: true };
  }

  @Delete('members')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'body')
  async removeMember(@Body() body: IAddMemberDto) {
    await this.svc.removeMember(body.baseId, body.roleId, body.userId);
    return { ok: true };
  }

  // ─── import/export permissions (Round-26: Cloud §权限矩阵 §导入/导出权限) ───

  @Put('roles/:roleId/import-export')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'body')
  async setImportExport(
    @Param('roleId') roleId: string,
    @Body() body: IImportExportDto
  ) {
    return this.svc.setImportExport(
      body.baseId,
      roleId,
      body.tableId,
      body.canImport,
      body.canExport
    );
  }

  @Get('roles/:roleId/import-export')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'query')
  async listImportExport(
    @Param('roleId') roleId: string,
    @Query('baseId') baseId: string
  ) {
    return this.svc.listImportExport(baseId, roleId);
  }

  @Delete('roles/:roleId/import-export/:tableId')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'query')
  async deleteImportExport(
    @Param('roleId') roleId: string,
    @Param('tableId') tableId: string,
    @Query('baseId') baseId: string
  ) {
    return this.svc.deleteImportExport(baseId, roleId, tableId);
  }

  // ─── Cloud §权限矩阵 §配置角色访问范围 ────────────────────────────────────
  // Cloud says: 应用选择 可访问/无权限 ; 工作流选择 可访问/无权限 ;
  //   默认角色 只用于未分配任何自定义角色的成员.
  // setNodeAccess() already supports (table|app|workflow); we expose the app
  // and workflow paths through dedicated controllers and persist the
  // default-role setting in `meta.setting` so we avoid a schema migration.

  @Put('roles/:roleId/app-access')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'body')
  async setAppAccess(
    @Param('roleId') roleId: string,
    @Body() body: IAppAccessDto
  ) {
    const stored = body.access === 'accessible' ? 'editable' : body.access;
    await this.svc.setNodeAccess(body.baseId, roleId, 'app', body.appId, stored);
    return { ok: true, nodeType: 'app', access: body.access };
  }

  @Put('roles/:roleId/workflow-access')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'body')
  async setWorkflowAccess(
    @Param('roleId') roleId: string,
    @Body() body: IWorkflowAccessDto
  ) {
    const stored = body.access === 'accessible' ? 'editable' : body.access;
    await this.svc.setNodeAccess(body.baseId, roleId, 'workflow', body.workflowId, stored);
    return { ok: true, nodeType: 'workflow', access: body.access };
  }

  @Put('default-role')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'body')
  async setDefaultRole(@Body() body: IDefaultRoleDto) {
    await this.svc.setDefaultRoleForUnassigned(body.baseId, body.roleId);
    return { ok: true, baseId: body.baseId, defaultRoleId: body.roleId };
  }

  @Get('default-role')
  @Permissions('base|authority_matrix_config')
  @ResourceMeta('baseId', 'query')
  async getDefaultRole(@Query('baseId') baseId: string) {
    const defaultRoleId = await this.svc.getDefaultRoleForUnassigned(baseId);
    return { baseId, defaultRoleId };
  }
}
