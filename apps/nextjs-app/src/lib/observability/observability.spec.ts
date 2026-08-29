// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

import { __resetErrorReporterForTests, installErrorReporter } from './error-reporter';
import {
  __isFetchInstrumentationInstalled,
  installFetchInstrumentation,
  uninstallFetchInstrumentation,
} from './fetch-instrumentation';
import { defaultWebVitalsHandler, getWebVitalsHandler, setWebVitalsHandler } from './web-vitals';

describe('frontend observability modules', () => {
  afterEach(() => {
    uninstallFetchInstrumentation();
    __resetErrorReporterForTests();
    setWebVitalsHandler(defaultWebVitalsHandler);
  });

  describe('web-vitals handler', () => {
    it('installs a handler that can be retrieved', () => {
      const fn = vi.fn();
      setWebVitalsHandler(fn);
      expect(getWebVitalsHandler()).toBe(fn);
    });

    it('default handler does not throw on a minimal metric', () => {
      expect(() =>
        defaultWebVitalsHandler({
          id: 'm1',
          name: 'LCP',
          value: 1234,
          label: 'web-vital',
          startTime: 0,
        })
      ).not.toThrow();
    });
  });

  describe('fetch instrumentation', () => {
    it('is a no-op without window/fetch', () => {
      // In a node test environment window is undefined — install should not throw.
      expect(() => installFetchInstrumentation()).not.toThrow();
      // Without window, the install marker is never set.
      expect(__isFetchInstrumentationInstalled()).toBe(false);
    });

    it('uninstallFetchInstrumentation is safe when never installed', () => {
      expect(() => uninstallFetchInstrumentation()).not.toThrow();
    });
  });

  describe('error reporter', () => {
    it('install is safe to call when window is undefined', () => {
      expect(() => installErrorReporter()).not.toThrow();
    });

    it('reset is safe to call when never installed', () => {
      expect(() => __resetErrorReporterForTests()).not.toThrow();
    });

    it('reset clears the install marker', () => {
      // Simulate a previous install by setting the global directly.
      (
        globalThis as { __teable_error_reporter_installed__?: boolean }
      ).__teable_error_reporter_installed__ = true;
      __resetErrorReporterForTests();
      expect(
        (globalThis as { __teable_error_reporter_installed__?: boolean })
          .__teable_error_reporter_installed__
      ).toBeUndefined();
    });
  });
});
