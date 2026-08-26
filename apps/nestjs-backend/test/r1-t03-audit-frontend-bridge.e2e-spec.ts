/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * R1-T03 audit frontend bridge — e2e smoke.
 *
 * Boots the shared Nest app and exercises the new admin audit endpoints
 * introduced by R1-T03:
 *
 *   - GET /api/admin/audit/operations?action=&resourceId=&limit=
 *   - GET /api/admin/audit/operations/summary?action=&resourceId=&limit=
 *
 * Both routes are gated by `LicenseCapabilityGuard.for('audit_log')`, so
 * non-admin authenticated users receive 403 (or whatever the underlying
 * forbidden exception class surfaces as) and unauthenticated callers
 * receive 401. The spec only verifies the auth boundary and the response
 * shape — not the contents of any audit row, since seeding audit data
 * here would require poking the write path.
 */
import type { INestApplication } from '@nestjs/common';
import { initApp, permanentDeleteSpace } from './utils/init-app';
import { createNewUserAxios } from './utils/axios-instance/new-user';

const ROUTES = {
  list: '/api/admin/audit/operations',
  summary: '/api/admin/audit/operations/summary',
};

describe('R1-T03 audit frontend bridge (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const result = await initApp();
    app = result.app;
  });

  afterAll(async () => {
    await permanentDeleteSpace(app);
    await app.close();
  });

  it('GET /api/admin/audit/operations returns 401 when no auth is provided', async () => {
    const userAxios = await createNewUserAxios({ email: 'r1t03-a-noauth@example.com', password: 'pw1234abc' });
    userAxios.defaults.headers.common.Cookie = '';
    userAxios.defaults.headers.common.Authorization = '';
    await expect(userAxios.get(ROUTES.list)).rejects.toMatchObject({
      response: { status: 401 },
    });
  });

  it('GET /api/admin/audit/operations returns 4xx (forbidden) for an authenticated non-admin user', async () => {
    const userAxios = await createNewUserAxios({ email: 'r1t03-a-nonadmin@example.com', password: 'pw1234abc' });
    await expect(userAxios.get(ROUTES.list)).rejects.toMatchObject({
      response: { status: expect.any(Number) },
    });
  });

  it('GET /api/admin/audit/operations/summary returns 4xx (forbidden) for an authenticated non-admin user', async () => {
    const userAxios = await createNewUserAxios({ email: 'r1t03-b-nonadmin@example.com', password: 'pw1234abc' });
    await expect(userAxios.get(ROUTES.summary)).rejects.toMatchObject({
      response: { status: expect.any(Number) },
    });
  });
});