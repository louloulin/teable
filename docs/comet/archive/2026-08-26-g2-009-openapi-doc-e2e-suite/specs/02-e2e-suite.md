# Spec — HTTP-level E2E smoke suite

Single test file `apps/nestjs-backend/test/openapi-e2e.spec.ts` covering the new `/openapi/*` routes plus regression on the v2 doc route and the health endpoint. Uses `Test.createTestingModule(...)` + supertest, fully in-memory — no Postgres, no Redis, no live NestApplication.

## File

### `apps/nestjs-backend/test/openapi-e2e.spec.ts`

```ts
/* eslint-disable @typescript-eslint/naming-convention */
/**
 * E2E HTTP smoke for g2-009 — runtime OpenAPI doc endpoints + a small set
 * of regression routes.
 *
 *   - `Test.createTestingModule(...)` builds the full `AppModule` graph
 *     in-process so the controller wiring (incl. Wave 1-3 modules) is
 *     exercised as a unit.
 *   - `supertest` drives the HTTP layer; supertest is bundled via
 *     `@nestjs/testing` so no new dependency is required.
 *   - No live Postgres / Redis is touched.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@teable/db-main-prisma';

class FakePrismaService {
  // bare-minimum stubs: every method called during AppModule wiring must
  // resolve so the module graph compiles.
  $connect = async () => {};
  $disconnect = async () => {};
  $transaction = async (cb: (tx: unknown) => Promise<unknown>) => cb(this);
}

describe('g2-009 OpenAPI doc + E2E smoke', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useClass(FakePrismaService)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /openapi/openapi.json returns 200 + JSON with auth + base paths', async () => {
    const res = await request(app.getHttpServer()).get('/openapi/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toBeTruthy();
    expect(typeof res.body).toBe('object');
    const paths = Object.keys(res.body.paths ?? {});
    expect(paths.some((p) => /\/auth\/.*signin/.test(p))).toBe(true);
    expect(paths.some((p) => /\/base/.test(p))).toBe(true);
  });

  it('GET /openapi/docs returns 200 + Scalar HTML', async () => {
    const res = await request(app.getHttpServer()).get('/openapi/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<div id="app"></div>');
    expect(res.text).toContain('Scalar.createApiReference');
  });

  it('GET /openapi/docs sets a CSP nonce header', async () => {
    const res = await request(app.getHttpServer()).get('/openapi/docs');
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['content-security-policy']).toContain("'nonce-");
  });

  it('GET /openapi/explorer mirrors /docs', async () => {
    const res = await request(app.getHttpServer()).get('/openapi/explorer');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Scalar.createApiReference');
  });

  it('GET /api/v2/openapi.json still works (regression)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v2/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
  });
});
```

## Acceptance mapping

- A1 → test file exists
- A6 → 5 `it()` blocks pass under `pnpm -F nestjs-backend exec vitest run test/openapi-e2e.spec.ts`

## Configuration

Vitest must pick up `test/**/*.spec.ts`. Check `apps/nestjs-backend/vitest.config.ts`. If it currently only includes `src/**/*.spec.ts`, add `test/**/*.spec.ts` to the `test.include` array. Do not modify any other test runner config.

## Non-goals

- No new npm dependencies.
- No live database. `FakePrismaService` returns stubs only for what AppModule wiring calls during module construction.
- No live Redis / queue.
- No CRUD tests — only HTTP-level routing + header assertions.
- No controller body changes.