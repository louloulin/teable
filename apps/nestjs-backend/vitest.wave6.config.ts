import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// Wave 6 — real-integration happy path against the LIVE podman Postgres + Redis
// (not the per-worker clone harness used by vitest-e2e.config.ts). The spec
// file itself loads apps/nestjs-backend/.env.wave6 so the AppModule wires up
// against the real cluster and the test exercises the same code path an
// operator would hit on a fresh install.

process.env.TZ = 'UTC';
process.env.NODE_ENV = 'development';

export default defineConfig({
  resolve: {
    alias: { buffer: 'node:buffer' },
    conditions: ['@teable/source'],
  },
  ssr: {
    resolve: {
      conditions: ['@teable/source'],
      externalConditions: ['@teable/source'],
    },
  },
  plugins: [swc.vite({ jsc: { target: 'es2022' } }), tsconfigPaths()],
  cacheDir: '../../.cache/vitest/nestjs-backend/wave6',
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.wave6.setup.ts'],
    passWithNoTests: true,
    pool: 'forks',
    testTimeout: 120000,
    hookTimeout: 180000,
    include: ['test/wave6-*.e2e-spec.ts'],
  },
});
