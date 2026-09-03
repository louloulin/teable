import { Body, Controller, ForbiddenException, Get, Post, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Public } from '../auth/decorators/public.decorator';
import type { IClsStore } from '../../types/cls';
import { GenericConnectorService } from './generic-connector.service';
import type { GenericSourceSpec } from './generic-connector.types';

/**
 * Round-23: Generic Connector controller. 4 endpoints under /api/generic-connector/.
 *
 *   GET  /probe     — registry probe (count + builtin types)
 *   GET  /adapters  — list registered adapters (builtin + runtime)
 *   POST /register  — register a new adapter at runtime (parity surface)
 *   POST /fetch     — dispatch a GenericSourceSpec to its registered adapter
 *
 * Per-request tokens are never stored. Registry inspection remains public;
 * registration and fetch require the normal authenticated request guard.
 */
@Controller('api/generic-connector')
export class GenericConnectorController {
  constructor(
    private readonly service: GenericConnectorService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @Public()
  @Get('probe')
  probe() {
    return this.service.probe();
  }

  @Public()
  @Get('adapters')
  adapters() {
    return this.service.listAdapters();
  }

  @Post('register')
  register(
    @Body() body: { type: string; displayName?: string; description?: string }
  ) {
    if (!this.cls.get('user.isAdmin')) {
      throw new ForbiddenException('generic adapter registration requires an administrator');
    }
    return this.service.register(body ?? { type: '' });
  }

  @Post('fetch')
  async fetch(@Body() body: { spec: GenericSourceSpec }) {
    if (!this.cls.get('user.id')) {
      throw new UnauthorizedException('generic connector fetch requires authentication');
    }
    const spec = body?.spec;
    if (!spec || !spec.adapterType || !spec.endpoint) {
      return { ok: false, error: 'spec.adapterType and spec.endpoint are required' };
    }
    return this.service.fetch(spec);
  }
}
