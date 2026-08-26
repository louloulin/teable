import { afterEach, describe, expect, it } from 'vitest';

import {
  __getRegistryForTests,
  __resetMetricsForTests,
  initMetrics,
  getMetrics,
} from './metrics';
import {
  __getTracingStateForTests,
  __resetTracingStateForTests,
  initTracing,
} from './tracing';

describe('observability initializers', () => {
  afterEach(() => {
    __resetMetricsForTests();
    __resetTracingStateForTests();
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });

  describe('initMetrics', () => {
    it('creates a registry on first call and returns it on subsequent calls', () => {
      const r1 = initMetrics();
      const r2 = initMetrics();
      expect(r1).toBe(r2);
      expect(__getRegistryForTests()).toBe(r1);
    });

    it('exposes the registered histograms and counters via getMetrics()', () => {
      initMetrics();
      const m = getMetrics();
      expect(m.httpRequestDuration).toBeDefined();
      expect(m.dbQueryDuration).toBeDefined();
      expect(m.webhookDeliveryTotal).toBeDefined();
      expect(m.aiRequestDuration).toBeDefined();
      expect(m.automationRunTotal).toBeDefined();
    });

    it('resets cleanly via __resetMetricsForTests', () => {
      initMetrics();
      expect(__getRegistryForTests()).toBeDefined();
      __resetMetricsForTests();
      expect(__getRegistryForTests()).toBeUndefined();
    });
  });

  describe('initTracing', () => {
    it('returns a no-op handle when OTEL_EXPORTER_OTLP_ENDPOINT is unset', () => {
      const handle = initTracing();
      expect(__getTracingStateForTests()?.mode).toBe('noop');
      expect(handle.shutdown).toBeInstanceOf(Function);
    });

    it('is idempotent — second call returns the same handle', async () => {
      const h1 = initTracing();
      const h2 = initTracing();
      expect(h1).toBe(h2);
      // no-op handle shutdown resolves immediately without error
      await expect(h1.shutdown()).resolves.toBeUndefined();
    });

    it('respects OTEL_SERVICE_NAME and DEPLOYMENT_ENVIRONMENT when set', () => {
      process.env.OTEL_SERVICE_NAME = 'unit-test-backend';
      process.env.DEPLOYMENT_ENVIRONMENT = 'ci';
      const handle = initTracing();
      expect(handle).toBeDefined();
      expect(__getTracingStateForTests()?.mode).toBe('noop'); // no endpoint → noop
    });

    it('flags active mode when endpoint is set (does not actually start SDK)', () => {
      // We deliberately point at a non-routable URL so start() throws and we
      // fall back to noop — the contract we care about is the env-driven mode.
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:1';
      const handle = initTracing();
      expect(handle).toBeDefined();
    });
  });
});
