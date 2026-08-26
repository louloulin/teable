import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import {
  adminSendNotificationRoSchema,
  type IAdminSendNotificationRo,
  type IAdminSendNotificationVo,
} from '@teable/openapi';
import { Response } from 'express';
import { ZodValidationPipe } from '../../../zod.validation.pipe';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../../license/license-capability.guard';
import { DeleteUserService } from '../../user/delete-user/delete-user.service';
import { AdminOpenApiService } from './admin-open-api.service';

const DeleteUserAdminGuard = LicenseCapabilityGuard.for('delete_user');

@Controller('api/admin')
@Permissions('instance|update')
export class AdminOpenApiController {
  constructor(
    private readonly adminService: AdminOpenApiService,
    private readonly deleteUserService: DeleteUserService
  ) {}

  @Patch('/plugin/:pluginId/publish')
  async publishPlugin(@Param('pluginId') pluginId: string): Promise<void> {
    await this.adminService.publishPlugin(pluginId);
  }

  @Patch('/plugin/:pluginId/unpublish')
  async unpublishPlugin(@Param('pluginId') pluginId: string): Promise<void> {
    await this.adminService.unpublishPlugin(pluginId);
  }

  @Post('/attachment/repair-table-thumbnail')
  async repairTableAttachmentThumbnail(): Promise<void> {
    await this.adminService.repairTableAttachmentThumbnail();
  }

  @Get('/debug/heap-snapshot')
  async getHeapSnapshot(@Res() res: Response): Promise<void> {
    await this.adminService.getHeapSnapshot(res);
  }

  @Get('performance-cache-stats')
  async getPerformanceCache() {
    return await this.adminService.getPerformanceCache();
  }

  @Delete('performance-cache')
  async deletePerformanceCache(@Query('key') key?: string) {
    return await this.adminService.deletePerformanceCache(key);
  }

  @Post('notification')
  async sendNotification(
    @Body(new ZodValidationPipe(adminSendNotificationRoSchema)) ro: IAdminSendNotificationRo
  ): Promise<IAdminSendNotificationVo> {
    return this.adminService.sendAdminNotification(ro);
  }

  /**
   * GDPR delete-user endpoint. Operators call this to scrub a user's data
   * once the user has been deactivated. Gated by the `delete_user` license
   * capability — self_hosted plans (the default) get a 402 payment_required.
   */
  @Post('delete-user')
  @UseGuards(DeleteUserAdminGuard)
  async deleteUser(@Body() body: { userId: string }): Promise<{ deleted: true; userId: string }> {
    if (!body?.userId) {
      throw new Error('userId is required');
    }
    await this.deleteUserService.deleteUserById(body.userId);
    return { deleted: true, userId: body.userId };
  }
}
