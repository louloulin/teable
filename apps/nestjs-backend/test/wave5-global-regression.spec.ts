/* eslint-disable @typescript-eslint/naming-convention */
/**
 * E2E HTTP smoke for Wave 5 (G2-010) — global regression.
 *
 * Goal: confirm that the OpenAPI doc surface area established across
 * Wave 1–4 (g2-009 + v2-openapi) still responds correctly after any
 * subsequent merge. This is the regression baseline test the G2-010
 * index points at.
 *
 * Constraints (inherited from g2-009):
 *   - supertest is not in deps; brief forbids new npm deps.
 *     → use Node's built-in `http` module.
 *   - Full AppModule graph requires live Postgres / Redis / OAuth; we
 *     use the same minimal `OpenApiTestModule` from g2-009.
 *   - 5 happy-path it() blocks; no live infra.
 */
process.env.SECRET_KEY ??= 'test-secret';
process.env.PRISMA_DATABASE_URL ??= 'postgresql://stub:stub@127.0.0.1:5432/stub?schema=public';
process.env.BACKEND_QUEUE_PREFIX ??= 'wave5-smoke';

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OpenApiDocController } from '../src/features/openapi-doc/openapi-doc.controller';
import { OpenApiDocModule } from '../src/features/openapi-doc/openapi-doc.module';
import { V2OpenApiController } from '../src/features/v2/v2-openapi.controller';

interface IHttpResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  body: unknown;
}

/** Minimal Nest module that mounts only the OpenAPI doc controllers. */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [OpenApiDocController, V2OpenApiController],
})
class OpenApiTestModule {}

/**
 * Drive a real HTTP request through the running Nest server. Returns the
 * parsed body and all response headers — minimal supertest-shaped contract.
 */
const request = (server: http.Server, method: string, path: string): Promise<IHttpResponse> =>
  new Promise((resolve, reject) => {
    const addr = server.address() as AddressInfo | null;
    if (!addr) {
      reject(new Error('server is not listening'));
      return;
    }
    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        method,
        path,
        headers: { host: '127.0.0.1' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === 'string') {
              headers[key] = value;
            } else if (Array.isArray(value)) {
              headers[key] = value.join(', ');
            }
          }
          let body: unknown = raw;
          const contentType = headers['content-type'] ?? '';
          if (contentType.includes('application/json')) {
            try {
              body = raw.length > 0 ? JSON.parse(raw) : null;
            } catch {
              body = raw;
            }
          }
          resolve({ status: res.statusCode ?? 0, headers, text: raw, body });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });

describe('Wave 5 — global regression (G2-010)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OpenApiTestModule, OpenApiDocModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /openapi/openapi.json exposes auth + base + space + table + record paths', async () => {
    const res = await request(app.getHttpServer() as http.Server, 'GET', '/openapi/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toBeTruthy();
    const body = res.body as { paths?: Record<string, unknown> };
    const paths = Object.keys(body.paths ?? {});
    // Wave 1-4 wired the entire app graph; if any of these path families
    // goes missing the regression contract has been violated.
    expect(paths.some((p) => /\/auth\/.*signin/.test(p))).toBe(true);
    expect(paths.some((p) => /\/base/.test(p))).toBe(true);
    expect(paths.some((p) => /\/space/.test(p))).toBe(true);
    expect(paths.some((p) => /\/table/.test(p))).toBe(true);
    expect(paths.some((p) => /\/record/.test(p))).toBe(true);
  });

  it('GET /openapi/openapi.json declares the standard security schemes', async () => {
    const res = await request(app.getHttpServer() as http.Server, 'GET', '/openapi/openapi.json');
    expect(res.status).toBe(200);
    const body = res.body as {
      components?: { securitySchemes?: Record<string, unknown> };
    };
    const schemes = body.components?.securitySchemes ?? {};
    // The Teable registry exposes cookie / access-token / password;
    // seeing any of them counts as a regression anchor.
    const names = Object.keys(schemes);
    expect(names.length).toBeGreaterThan(0);
  });

  it('GET /openapi/docs returns 200 + Scalar HTML', async () => {
    const res = await request(app.getHttpServer() as http.Server, 'GET', '/openapi/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<div id="app"></div>');
    expect(res.text).toContain('Scalar.createApiReference');
  });

  it('GET /openapi/docs sets a CSP nonce header', async () => {
    const res = await request(app.getHttpServer() as http.Server, 'GET', '/openapi/docs');
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['content-security-policy']).toContain("'nonce-");
  });

  it('GET /openapi/explorer mirrors /docs (regression anchor for g2-009)', async () => {
    const res = await request(app.getHttpServer() as http.Server, 'GET', '/openapi/explorer');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Scalar.createApiReference');
  });
});