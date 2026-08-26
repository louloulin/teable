import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { buildSync } from 'esbuild';

// Wave 6 — load the integration env BEFORE any module touches process.env.
// Parse .env.wave6 directly (vitest's setupFiles run before any config module,
// and dotenv-flow's flow semantics hide a single-file load behind a directory
// heuristic that misfires in this layout).
const envPath = path.join(__dirname, '.env.wave6');
if (fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// Avoid idle socket reuse races — same trick as vitest-e2e.setup.ts.
http.globalAgent = new http.Agent({ keepAlive: false });

// Build the worker bundle (the AppModule imports src/worker/* — see e2e.setup.ts).
const workerEntry = path.join(__dirname, 'src/worker');
buildSync({
  entryPoints: [path.join(workerEntry, '**.ts')],
  outdir: path.join(__dirname, 'dist/worker'),
  bundle: true,
  platform: 'node',
  target: 'node20',
});
process.env.E2E_WORKER_PREBUILT = '1';

// eslint-disable-next-line no-console
console.log('[wave6-setup] PRISMA_DATABASE_URL=', process.env.PRISMA_DATABASE_URL);
// eslint-disable-next-line no-console
console.log('[wave6-setup] BACKEND_CACHE_REDIS_URI=', process.env.BACKEND_CACHE_REDIS_URI);
// eslint-disable-next-line no-console
console.log('[wave6-setup] STORAGE_PREFIX=', process.env.STORAGE_PREFIX);
