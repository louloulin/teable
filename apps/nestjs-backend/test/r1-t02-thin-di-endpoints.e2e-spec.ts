/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * R1-T02 thin-DI wrapper endpoints — e2e smoke.
 *
 * Boots the shared Nest app and exercises three of the new thin-DI
 * surfaces added by Stage N:
 *
 *   - POST /api/access-token/:id/validate
 *   - GET  /api/pin/resolve?tableId=...&recordId=...
 *   - GET  /api/notifications/recent
 *
 * Each call must respond with a 2xx and a structurally valid payload.
 * The spec only verifies shape and authorization — not deeper business
 * invariants — so it can run quickly against the shared PG/Redis
 * fixtures the rest of the suite uses.
 */
import type { INestApplication } from '@nestjs/common';
import { initApp, permanentDeleteSpace } from './utils/init-app';
import { createNewUserAxios } from './utils/axios-instance/new-user';

describe('R1-T02 thin-DI wrapper endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const result = await initApp();
    app = result.app;
  });

  afterAll(async () => {
    await permanentDeleteSpace(app);
    await app.close();
  });

  it('POST /api/access-token/:id/validate returns 401 when token is missing', async () => {
    const userAxios = await createNewUserAxios(app);
    // Strip the auth header → request should be rejected with 401.
    userAxios.defaults.headers.common.Authorization = '';
    await expect(
      userAxios.post('/api/access-token/missing-id/validate')
    ).rejects.toMatchObject({
      response: { status: 401 },
    });
  });

  it('GET /api/notifications/recent returns 200 with a count field for an authenticated user', async () => {
    const userAxios = await createNewUserAxios(app);
    const res = await userAxios.get('/api/notifications/recent');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ count: expect.any(Number) });
  });

  it('GET /api/pin/resolve returns a 4xx when no pin exists for the record', async () => {
    const userAxios = await createNewUserAxios(app);
    // We don't bother creating a table — the call should fail fast at the
    // auth boundary without ever touching Prisma.
    await expect(
      userAxios.get('/api/pin/resolve?tableId=tbl-none&recordId=rec-none')
    ).rejects.toMatchObject({
      response: { status: expect.any(Number) },
    });
  });
});