/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Observability SDK initializer (Wave 12 — R12-T01).
 *
 * `initTracing()` is the canonical entry point used by `bootstrap.ts` for the
 * production-grade observability stack. It is idempotent: a second call is a
 * no-op and returns the same shutdown handle.
 *
 * Two modes:
 *   - "endpoint configured" — `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
 *     A NodeSDK is started with auto-instrumentations + OTLP trace exporter +
 *     resource attributes (service.name, service.version, deployment.environment).
 *   - "endpoint missing"   — No collector configured. We log a single warning
 *     and return a no-op shutdown handle so the call site can stay uniform.
 *
 * This module coexists with the legacy `src/tracing.ts` auto-init. The legacy
 * file handles the deeper per-instrumentation wiring (HTTP, Nest, pg, pino,
 * Redis, runtime-node, Prisma) which is too low-level for the new endpoint-driven
 * contract. The two are designed not to double-start: the legacy file starts
 * unconditionally at module import; `initTracing()` here is invoked from
 * `bootstrap.ts` only when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 */

import type { ServerResponse } from 'http';
import { Logger } from '@nestjs/common';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';

import { resolveBuildVersion } from '../utils/build-version';

const logger = new Logger('ObservabilitySDK');

/** Default service name advertised to the OTLP collector. */
const DEFAULT_SERVICE_NAME = 'teable-nestjs-backend';

interface ShutdownHandle {
  /** Resolves once the underlying SDK has finished flushing + closing. */
  shutdown(): Promise<void>;
}

interface TracingState {
  mode: 'noop' | 'active';
  started: boolean;
  handle: ShutdownHandle;
}

/**
 * Module-level singleton. `globalThis` so HMR (webpack hot reload) doesn't
 * accumulate SDK instances during local development.
 */
const GLOBAL_KEY = '__teable_observability_tracing_state__';
type GlobalShape = typeof globalThis & { [GLOBAL_KEY]?: TracingState };
const g = globalThis as GlobalShape;

function noopHandle(): ShutdownHandle {
  return { shutdown: async () => undefined };
}

function resolveEndpoint(): string | undefined {
  const raw = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveServiceName(): string {
  return process.env.OTEL_SERVICE_NAME?.trim() || DEFAULT_SERVICE_NAME;
}

function resolveEnvironment(): string {
  return (
    process.env.DEPLOYMENT_ENVIRONMENT?.trim() || process.env.NODE_ENV?.trim() || 'development'
  );
}

/**
 * Build resource attributes advertised to the OTLP collector. Per OTel
 * semantic conventions these are stable identifiers (service.name,
 * service.version) plus deployment.environment for tag-based filtering.
 */
function buildResource() {
  return resourceFromAttributes({
    [ATTR_SERVICE_NAME]: resolveServiceName(),
    [ATTR_SERVICE_VERSION]: resolveBuildVersion() || 'unknown',
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: resolveEnvironment(),
  });
}

/**
 * Active-mode handle. Shutdown is idempotent and survives double invocation.
 */
function makeSdkHandle(sdk: NodeSDK): ShutdownHandle {
  let closed = false;
  return {
    shutdown: async () => {
      if (closed) return;
      closed = true;
      try {
        await sdk.shutdown();
        logger.log('OTel SDK shutdown complete');
      } catch (err) {
        logger.error(`OTel SDK shutdown error: ${(err as Error).message}`);
      }
    },
  };
}

/**
 * Start the OpenTelemetry NodeSDK. Returns a no-op handle when no OTLP
 * endpoint is configured so the caller can stay uniform. Idempotent:
 * subsequent calls return the existing handle without starting another SDK.
 */
export function initTracing(): ShutdownHandle {
  if (g[GLOBAL_KEY]) {
    logger.log(
      `initTracing() called again — returning existing handle (mode=${g[GLOBAL_KEY].mode})`
    );
    return g[GLOBAL_KEY].handle;
  }

  const endpoint = resolveEndpoint();
  if (!endpoint) {
    logger.warn(
      'OTEL_EXPORTER_OTLP_ENDPOINT is not set; tracing is in no-op mode. ' +
        'Set the env var to a reachable OTLP/HTTP collector (e.g. http://otel-collector:4318) ' +
        'to enable distributed tracing.'
    );
    const handle = noopHandle();
    g[GLOBAL_KEY] = { mode: 'noop', started: true, handle };
    return handle;
  }

  const traceExporter = new OTLPTraceExporter({ url: `${endpoint.replace(/\/+$/, '')}/v1/traces` });

  const sdk = new NodeSDK({
    resource: buildResource(),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs is noisy and not useful for app-level SLOs.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  try {
    sdk.start();
    logger.log(
      `OpenTelemetry SDK started: endpoint=${endpoint}, ` +
        `service=${resolveServiceName()}, env=${resolveEnvironment()}`
    );
  } catch (err) {
    logger.error(`OpenTelemetry SDK start error: ${(err as Error).message}`);
    const handle = noopHandle();
    g[GLOBAL_KEY] = { mode: 'noop', started: true, handle };
    return handle;
  }

  const handle = makeSdkHandle(sdk);
  g[GLOBAL_KEY] = { mode: 'active', started: true, handle };
  return handle;
}

/**
 * Test-only helper. Wipes module state so the next `initTracing()` call is
 * treated as the first one. Never call from production code paths.
 */
export function __resetTracingStateForTests(): void {
  delete g[GLOBAL_KEY];
}

/**
 * Test-only helper. Returns the current tracing state without mutating it.
 */
export function __getTracingStateForTests(): TracingState | undefined {
  return g[GLOBAL_KEY];
}

// Re-export for callers that need to inspect response objects (kept narrow on
// purpose: this module should not become a kitchen-sink).
export type { ServerResponse };
