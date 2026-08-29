/**
 * /metrics — Prometheus scrape endpoint (Wave 12 — R12-T01).
 *
 * Exposes the registered metric registry in Prometheus text exposition format.
 * This endpoint is intentionally NOT gated by auth so Prometheus can scrape it
 * directly. In production, restrict access via network policy / IP allowlist
 * or front it with a sidecar that injects a basic-auth header.
 */

import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../features/auth/decorators/public.decorator';
import { initMetrics } from './metrics';

@Controller('metrics')
@Public()
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async metrics(): Promise<string> {
    const registry = initMetrics();
    return registry.metrics();
  }
}
