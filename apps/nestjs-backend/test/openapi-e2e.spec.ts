/* eslint-disable @typescript-eslint/naming-convention */
/**
 * E2E HTTP smoke for g2-009 — runtime OpenAPI doc endpoints + a small set
 * of regression routes.
 *
 *   - The OpenApiDocController and V2OpenApiController are wired together
 *     in a minimal test module that pulls in ONLY the shared config +
 *     OpenAPI registry they need. The full AppModule graph requires live
 *     Postgres / Redis / OAuth keys / mailer; spinning that up just to
 *     check `GET /openapi/docs` would obscure the failure mode and add
 *     hundreds of unrelated deps.
 *   - HTTP requests go through Node's built-in `http` module against
 *     `app.getHttpServer()`. supertest is not in `dependencies`, and the
 *     brief forbids new npm deps.
 *   - No live Postgres / Redis / OAuth is touched.
 */
// Stub env so config / module constructors don't blow up on missing env.
process.env.SECRET_KEY ??= 'test-secret';
process.env.PRISMA_DATABASE_URL ??= 'postgresql://stub:stub@127.0.0.1:5432/stub?schema=public';
process.env.BACKEND_QUEUE_PREFIX ??= 'g2-009-smoke';

import http from 'http';
import type { AddressInfo } from 'net';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
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

describe('g2-009 OpenAPI doc + E2E smoke', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OpenApiTestModule, OpenApiDocModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    // Bind to an ephemeral port so `app.getHttpServer()` is reachable.
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /openapi/openapi.json returns 200 + JSON with auth + base paths', async () => {
    const res = await request(app.getHttpServer() as http.Server, 'GET', '/openapi/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toBeTruthy();
    expect(typeof res.body).toBe('object');
    const body = res.body as { paths?: Record<string, unknown> };
    const paths = Object.keys(body.paths ?? {});
    expect(paths.some((p) => /\/auth\/.*signin/.test(p))).toBe(true);
    expect(paths.some((p) => /\/base/.test(p))).toBe(true);
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

  it('GET /openapi/explorer mirrors /docs', async () => {
    const res = await request(app.getHttpServer() as http.Server, 'GET', '/openapi/explorer');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Scalar.createApiReference');
  });

  it('GET /api/v2/openapi.json still works (regression)', async () => {
    const res = await request(app.getHttpServer() as http.Server, 'GET', '/api/v2/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
  });
});
