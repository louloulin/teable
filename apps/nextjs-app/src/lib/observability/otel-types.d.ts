/**
 * Ambient module declarations for the optional OpenTelemetry browser packages
 * used by `rum-init.ts`.  When a deployment opts in to RUM by setting
 * `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT`, the matching packages should be
 * installed; the declarations here keep `tsc --noEmit` happy in the meantime
 * without forcing the dependency on OSS contributors.
 *
 * The shapes below are deliberately minimal — they match only what
 * `rum-init.ts` consumes, so that an upstream API change does not silently
 * break the runtime contract.
 *
 * License: AGPL-3.0
 */

declare module '@opentelemetry/api' {
  export const context: unknown;
  export class BatchSpanProcessor {
    constructor(exporter: unknown);
  }
  export class W3CTraceContextPropagator {
    constructor();
  }
}

declare module '@opentelemetry/sdk-trace-web' {
  export class WebTracerProvider {
    constructor(config: {
      resource: unknown;
      spanProcessors: unknown[];
    });
    register(config: { context: unknown; propagator: unknown }): void;
  }
}

declare module '@opentelemetry/exporter-trace-otlp-http' {
  export class OTLPTraceExporter {
    constructor(config: { url: string });
  }
}

declare module '@opentelemetry/resources' {
  export class Resource {
    constructor(attrs: Record<string, string>);
  }
}
