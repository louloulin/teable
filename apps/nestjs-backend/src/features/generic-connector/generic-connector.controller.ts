import { Body, Controller, Get, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
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
 * Per-request token (not stored). Marked Public so unauth probes work
 * (matches other import-* controllers).
 */
@Controller('api/generic-connector')
export class GenericConnectorController {
  constructor(private readonly service: GenericConnectorService) {}

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

  @Public()
  @Post('register')
  register(
    @Body() body: { type: string; displayName?: string; description?: string }
  ) {
    return this.service.register(body ?? { type: '' });
  }

  @Public()
  @Post('fetch')
  async fetch(@Body() body: { spec: GenericSourceSpec }) {
    const spec = body?.spec;
    if (!spec || !spec.adapterType || !spec.endpoint) {
      return { ok: false, error: 'spec.adapterType and spec.endpoint are required' };
    }
    return this.service.fetch(spec);
  }
}
