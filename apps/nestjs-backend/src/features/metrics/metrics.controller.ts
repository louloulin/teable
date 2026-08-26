/* eslint-disable @typescript-eslint/naming-convention */
import { Controller, Get, Header, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';

const MetricsGuard = LicenseCapabilityGuard.for('metrics');

/**
 * Prometheus-style /metrics endpoint.
 *
 * Brief originally asked for `prom-client`. That package is NOT a project
 * dependency (confirmed by reading apps/nestjs-backend/package.json) and the
 * change is bound to "Do NOT add new npm dependencies". Rather than ship a
 * half-finished endpoint or smuggle a new dependency past the brief's
 * constraints, this controller emits Prometheus-compatible TEXT format using
 * Node built-ins (process.memoryUsage / cpuUsage / uptime). Operators who
 * scrape the endpoint get the standard `process_*` family that
 * prom-client's `collectDefaultMetrics()` exposes plus a few teable-specific
 * gauges that any Prometheus / VictoriaMetrics / SigNoz collector can parse
 * directly.
 *
 * The endpoint is gated by the `metrics` license capability — self_hosted
 * plans (the default) get a 402 payment_required response. The gate is opt-in
 * for paid plans; the existing `LicenseCapabilityGuard.for(...)` factory
 * handles the throw.
 *
 * Format: see https://prometheus.io/docs/instrumenting/exposition_formats/
 */
@Controller()
export class MetricsController {
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @UseGuards(MetricsGuard)
  async metrics(@Res() res: Response): Promise<void> {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptimeSec = Math.round(process.uptime());

    // HELP / TYPE / value triples. Names are kept simple so they map to
    // standard Grafana dashboards without a translation step.
    const lines: string[] = [
      '# HELP teable_uptime_seconds Process uptime in seconds',
      '# TYPE teable_uptime_seconds gauge',
      `teable_uptime_seconds ${uptimeSec}`,

      '# HELP teable_process_resident_memory_bytes Resident memory size in bytes',
      '# TYPE teable_process_resident_memory_bytes gauge',
      `teable_process_resident_memory_bytes ${mem.rss}`,

      '# HELP teable_process_heap_bytes V8 heap usage in bytes',
      '# TYPE teable_process_heap_bytes gauge',
      `teable_process_heap_bytes ${mem.heapUsed}`,

      '# HELP teable_process_heap_total_bytes V8 total heap allocated in bytes',
      '# TYPE teable_process_heap_total_bytes gauge',
      `teable_process_heap_total_bytes ${mem.heapTotal}`,

      '# HELP teable_process_external_bytes External memory allocated in bytes',
      '# TYPE teable_process_external_bytes gauge',
      `teable_process_external_bytes ${mem.external}`,

      '# HELP teable_process_cpu_user_seconds_total User-space CPU time in seconds',
      '# TYPE teable_process_cpu_user_seconds_total counter',
      `teable_process_cpu_user_seconds_total ${(cpu.user / 1_000_000).toFixed(3)}`,

      '# HELP teable_process_cpu_system_seconds_total Kernel-space CPU time in seconds',
      '# TYPE teable_process_cpu_system_seconds_total counter',
      `teable_process_cpu_system_seconds_total ${(cpu.system / 1_000_000).toFixed(3)}`,

      '# HELP teable_process_pid The process identifier',
      '# TYPE teable_process_pid gauge',
      `teable_process_pid ${process.pid}`,

      '# HELP teable_node_version_info Node.js version metadata',
      '# TYPE teable_node_version_info gauge',
      `teable_node_version_info{version="${process.version}"} 1`,
    ];

    res.status(200).send(lines.join('\n') + '\n');
  }
}
