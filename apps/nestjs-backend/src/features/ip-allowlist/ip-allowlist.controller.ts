/* eslint-disable @typescript-eslint/naming-convention */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../types/cls';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { type IIpAllowlistEntry, IpAllowlistService } from './ip-allowlist.service';

const IpAllowlistAdminGuard = LicenseCapabilityGuard.for('ip_allowlist');

@Controller('api/admin/ip-allowlist')
@UseGuards(IpAllowlistAdminGuard)
export class IpAllowlistController {
  constructor(
    private readonly ipAllowlistService: IpAllowlistService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @Get()
  async list(): Promise<{ entries: IIpAllowlistEntry[] }> {
    const entries = await this.ipAllowlistService.getEntries();
    return { entries };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: { cidr: string; description?: string }
  ): Promise<IIpAllowlistEntry> {
    const userId = this.cls.get('user.id');
    return this.ipAllowlistService.addEntry(
      { cidr: body.cidr, description: body.description },
      userId
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const userId = this.cls.get('user.id');
    const deleted = await this.ipAllowlistService.removeEntry(id, userId);
    return { deleted };
  }
}
