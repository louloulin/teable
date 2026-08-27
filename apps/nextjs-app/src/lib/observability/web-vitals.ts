/**
 * Web Vitals capture (Wave 12 — R12-T03).
 *
 * Wires Next.js' built-in `useReportWebVitals` callback to a no-op-friendly
 * emitter. In production (RUM enabled), the metric is forwarded to OTLP.
 * When RUM is disabled (default for OSS), the metric is logged once at debug
 * level so developers can verify the channel is alive.
 *
 * Captures LCP / FID / CLS / TTFB / FCP / INP — the full Core Web Vitals set
 * Next.js exposes through `next/web-vitals`. We do not invent new metric
 * names; the metric.name from Next.js is the canonical label.
 */

'use client';

import type { NextWebVitalsMetric } from 'next/app';

export type WebVitalsHandler = (metric: NextWebVitalsMetric) => void;

const GLOBAL_KEY = '__teable_web_vitals_handler__';
type GlobalShape = typeof globalThis & { [GLOBAL_KEY]?: WebVitalsHandler };

/**
 * Install a Web Vitals handler. Subsequent calls replace the previous one,
 * which matches Next.js' contract that `useReportWebVitals` should accept a
 * single function reference at any time.
 */
export function setWebVitalsHandler(handler: WebVitalsHandler): void {
  (globalThis as GlobalShape)[GLOBAL_KEY] = handler;
}

export function getWebVitalsHandler(): WebVitalsHandler | undefined {
  return (globalThis as GlobalShape)[GLOBAL_KEY];
}

/**
 * Default handler: log structured JSON to console. When RUM is enabled, the
 * `startRUM()` initializer in `rum-init.ts` overrides this with a real
 * OTLP-forwarding handler.
 */
export const defaultWebVitalsHandler: WebVitalsHandler = (metric) => {
  if (typeof console === 'undefined') return;
  const payload = {
    kind: 'web_vital',
    name: metric.name,
    value: metric.value,
    id: metric.id,
    label: metric.label,
    startTime: metric.startTime,
    route: typeof window !== 'undefined' ? window.location?.pathname : undefined,
  };
  if (metric.label === 'web-vital') {
    console.debug('[web-vital]', JSON.stringify(payload));
  } else {
    console.info('[web-vital]', JSON.stringify(payload));
  }
};

/**
 * Re-export Next's metric type for consumers that want to write their own
 * handler without importing from `next/app` directly.
 */
export type { NextWebVitalsMetric };
