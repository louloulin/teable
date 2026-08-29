/**
 * Liveness probe — `GET /healthz`.
 *
 * Returns 200 as long as the process is up and the event loop is responsive.
 * Intentionally does NOT touch the DB, Redis, or queue: a failing dep should
 * take the pod out of rotation via `/readyz`, not kill the process. Kubernetes
 * `livenessProbe` restarts the container on persistent failure; we only want
 * that when the process itself is wedged.
 *
 * License: AGPL-3.0
 */

import { Controller, Get, HttpCode } from '@nestjs/common';
import { Public } from '../features/auth/decorators/public.decorator';

@Controller()
@Public()
export class HealthController {
  @Get('healthz')
  @HttpCode(200)
  live(): {
    status: 'ok';
    // eslint-disable-next-line @typescript-eslint/naming-convention
    uptime_s: number;
  } {
    return {
      status: 'ok',
      uptime_s: Math.round(process.uptime()),
    };
  }
}
