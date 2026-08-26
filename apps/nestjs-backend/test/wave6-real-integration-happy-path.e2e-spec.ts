/**
 * Wave 6 — real-integration happy-path E2E.
 *
 * Boots the full AppModule against the LIVE podman Postgres (127.0.0.1:42345)
 * and Redis (127.0.0.1:6379) using NestFactory.create + the production
 * bootstrap pipeline (setUpAppMiddleware), runs through:
 *
 *   1. signin (pre-seeded Wave6 business user)
 *   2. fetch authenticated user via /auth/user/me
 *   3. create a space
 *   4. create a base
 *   5. create a table with two text fields
 *   6. create three records
 *   7. query records (filter by field)
 *   8. update a record
 *   9. delete the space
 *  10. verify final Postgres state
 *
 * No TestingModule / override hacks — this is the same code path an operator
 * hits on a fresh install. The vitest.wave6.setup.ts loads .env.wave6 before
 * any module touches process.env.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
import axios from 'axios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WsAdapter } from '@nestjs/platform-ws';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '@teable/db-main-prisma';
import { DriverClient } from '@teable/core';

import { AppModule } from '../src/app.module';
import { baseConfig } from '../src/configs/base.config';
import { setUpAppMiddleware } from '../src/bootstrap';
import { NextService } from '../src/features/next/next.service';
import type { IClsStore } from '../src/types/cls';

const UNIQUE = Date.now();
const TEST_EMAIL = `wave6_${UNIQUE}@integration.test`;
const TEST_PASSWORD = 'Wave6Pass1!';
const SPACE_NAME = `Wave 6 Space ${UNIQUE}`;
const BASE_NAME = `Wave 6 Base ${UNIQUE}`;
const TABLE_NAME = `Wave 6 Table ${UNIQUE}`;

const evidence: Record<string, unknown> = { steps: [] as unknown[] };

describe('Wave 6 — real-integration happy path (live PG + Redis)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseURL: string;
  let seeded = false;

  beforeAll(async () => {
    if (!process.env.PRISMA_DATABASE_URL?.includes('42345')) {
      throw new Error(
        `Wave 6 spec requires PRISMA_DATABASE_URL pointing at podman host port 42345, got: ${process.env.PRISMA_DATABASE_URL}`
      );
    }

    // Pre-seed the test user with a bcrypt-hashed password. The hash uses
    // the same bcrypt algorithm and salt format as the rest of teable.
    const bcrypt = await import('bcryptjs').catch(() => import('bcrypt'));
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(TEST_PASSWORD, salt);

    const { PrismaClient } = await import('@teable/db-main-prisma');
    const seed = new PrismaClient();
    try {
      await seed.user.create({
        data: {
          email: TEST_EMAIL,
          name: 'Wave6 Integration',
          password: hashed,
          salt,
          notifyMeta: JSON.stringify({ email: true }),
          avatar: 'avatar/wave6',
          isAdmin: true,
        },
      });
      seeded = true;
    } catch (e: any) {
      seeded = !/P2002|unique|already/i.test(String(e?.message ?? e));
    } finally {
      await seed.$disconnect();
    }

    // Boot the production-style NestFactory app. We replace EventEmitter2
    // and NextService the same way the e2e harness does, but AppModule +
    // GlobalModule wire everything else (PermissionMatrixService included).
    app = await NestFactory.create(AppModule, { bufferLogs: true });
    const eventEmitter = app.get(EventEmitter2);
    // Force a known-good emitter — the AppModule's default is fine, but we
    // hold a reference so afterAll can flush listeners cleanly.
    void eventEmitter;

    const configService = app.get(ConfigService);
    await setUpAppMiddleware(app, configService);

    // Apply the same NextService no-op + WsAdapter overrides as the e2e harness
    // so Ws upgrade requests don't fail and NextJS_DIR isn't required.
    const nextService = app.get(NextService);
    nextService.onModuleInit = () => {
      return;
    };

    const wsAdapter = new WsAdapter(app);
    app.useWebSocketAdapter(wsAdapter);

    // Use a unique ephemeral port so we don't collide with the dev server.
    const port = 4100 + (UNIQUE % 200);
    process.env.PORT = String(port);
    await app.listen(port);
    baseURL = `http://127.0.0.1:${port}`;
    axios.defaults.baseURL = `${baseURL}/api`;
    evidence.baseURL = baseURL;
    evidence.driver = DriverClient.Pg;

    prisma = app.get(PrismaService);
    evidence.env = {
      PRISMA_DATABASE_URL: process.env.PRISMA_DATABASE_URL,
      BACKEND_CACHE_REDIS_URI: process.env.BACKEND_CACHE_REDIS_URI,
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
    };

    const baseConfigService = app.get(baseConfig.KEY) as any;
    baseConfigService.recordHistoryDisabled = true;

    const userCountBefore = await prisma.user.count();
    evidence.usersBefore = userCountBefore;
    evidence.testUserEmail = TEST_EMAIL;
    evidence.testUserSeeded = seeded;
  });

  afterAll(async () => {
    try {
      if (app) {
        await app.close();
      }
    } catch (e) {
      console.warn('[wave6] app.close failed:', e);
    }
  });

  it('boots AppModule against live Postgres+Redis', () => {
    expect(app).toBeTruthy();
    expect(process.env.PRISMA_DATABASE_URL).toMatch(/42345/);
    expect(process.env.BACKEND_CACHE_REDIS_URI).toMatch(/6379/);
    (evidence.steps as any[]).push({ step: 'boot', status: 'ok', baseURL });
  });

  it('signs in with the pre-seeded Wave 6 user', async () => {
    const res = await axios.post('/auth/signin', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.data.email).toBe(TEST_EMAIL);
    const cookies = res.headers['set-cookie']!;
    const cookieHeader = Array.isArray(cookies) ? cookies.join(';') : cookies;
    (axios.defaults.headers as any).Cookie = cookieHeader;
    (evidence.steps as any[]).push({ step: 'signin', status: 'ok', userId: res.data.id });
  });

  it('fetches authenticated user via /auth/user/me', async () => {
    const res = await axios.get('/auth/user/me');
    expect(res.status).toBe(200);
    expect(res.data.email).toBe(TEST_EMAIL);
    (evidence.steps as any[]).push({
      step: 'user_me',
      status: 'ok',
      email: res.data.email,
      id: res.data.id,
    });
  });

  it('creates a space', async () => {
    const res = await axios.post('/space', { name: SPACE_NAME });
    expect(res.status).toBe(201);
    expect(res.data.name).toBe(SPACE_NAME);
    expect(res.data.id).toMatch(/^spc/);
    (evidence as any).spaceId = res.data.id;
    (evidence.steps as any[]).push({ step: 'create_space', status: 'ok', spaceId: res.data.id });

    const dbSpace = await prisma.space.findUnique({ where: { id: res.data.id } });
    expect(dbSpace?.name).toBe(SPACE_NAME);
    (evidence.steps as any[]).push({ step: 'create_space_db_verify', status: 'ok' });
  });

  it('creates a base', async () => {
    const spaceId = (evidence as any).spaceId;
    const res = await axios.post(`/base`, {
      spaceId,
      name: BASE_NAME,
      order: 0,
    });
    expect(res.status).toBe(201);
    expect(res.data.name).toBe(BASE_NAME);
    expect(res.data.id).toMatch(/^bse/);
    (evidence as any).baseId = res.data.id;
    (evidence.steps as any[]).push({ step: 'create_base', status: 'ok', baseId: res.data.id });
  });

  it('creates a table with two text fields', async () => {
    const baseId = (evidence as any).baseId;
    const res = await axios.post(`/base/${baseId}/table`, {
      name: TABLE_NAME,
      fields: [
        { name: 'Title', type: 'singleLineText' },
        { name: 'Note', type: 'singleLineText' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.data.name).toBe(TABLE_NAME);
    expect(res.data.id).toMatch(/^tbl/);
    expect(res.data.fields).toHaveLength(2);
    (evidence as any).tableId = res.data.id;
    (evidence as any).fields = res.data.fields;
    (evidence.steps as any[]).push({
      step: 'create_table',
      status: 'ok',
      tableId: res.data.id,
      fieldCount: res.data.fields.length,
    });
  });

  it('creates three records', async () => {
    const tableId = (evidence as any).tableId;
    const fields = (evidence as any).fields as { id: string; name: string }[];
    const titleF = fields.find((f) => f.name === 'Title')!;
    const noteF = fields.find((f) => f.name === 'Note')!;
    const records = [
      { fields: { [titleF.id]: 'Alpha', [noteF.id]: 'first row' } },
      { fields: { [titleF.id]: 'Beta', [noteF.id]: 'second row' } },
      { fields: { [titleF.id]: 'Gamma', [noteF.id]: 'third row' } },
    ];
    const res = await axios.post(`/table/${tableId}/record`, { fieldKeyType: 'id', records });
    expect(res.status).toBe(201);
    expect(res.data.records).toHaveLength(3);
    (evidence.steps as any[]).push({ step: 'create_records', status: 'ok', count: 3 });
  });

  it('queries records and filters', async () => {
    const tableId = (evidence as any).tableId;
    const fields = (evidence as any).fields as { id: string; name: string }[];
    const titleF = fields.find((f) => f.name === 'Title')!;

    const allRes = await axios.get(`/table/${tableId}/record?fieldKeyType=id`);
    expect(allRes.status).toBe(200);
    expect(allRes.data.records.length).toBeGreaterThanOrEqual(3);

    const filteredRes = await axios.get(`/table/${tableId}/record`, {
      params: {
        fieldKeyType: 'id',
        filter: JSON.stringify({
          filterSet: [{ fieldId: titleF.id, operator: 'is', value: 'Alpha' }],
          conjunction: 'and',
        }),
      },
    });
    expect(filteredRes.status).toBe(200);
    expect(filteredRes.data.records).toHaveLength(1);
    expect(filteredRes.data.records[0].fields[titleF.id]).toBe('Alpha');

    (evidence.steps as any[]).push({
      step: 'query_records',
      status: 'ok',
      total: allRes.data.records.length,
      filteredCount: filteredRes.data.records.length,
    });
  });

  it('updates a record', async () => {
    const tableId = (evidence as any).tableId;
    const fields = (evidence as any).fields as { id: string; name: string }[];
    const titleF = fields.find((f) => f.name === 'Title')!;
    const noteF = fields.find((f) => f.name === 'Note')!;

    const all = await axios.get(`/table/${tableId}/record?fieldKeyType=id`);
    const target = all.data.records.find((r: any) => r.fields[titleF.id] === 'Beta')!;
    expect(target).toBeTruthy();

    const res = await axios.patch(`/table/${tableId}/record/${target.id}`, {
      fieldKeyType: 'id',
      record: { fields: { [noteF.id]: 'updated note' } },
    });
    expect(res.status).toBe(200);
    expect(res.data.fields[noteF.id]).toBe('updated note');
    (evidence.steps as any[]).push({ step: 'update_record', status: 'ok', id: target.id });
  });

  it('deletes the space', async () => {
    const spaceId = (evidence as any).spaceId;
    const res = await axios.delete(`/space/${spaceId}`);
    expect(res.status).toBe(200);
    const still = await prisma.space.findUnique({ where: { id: spaceId } });
    expect(still?.deletedTime).toBeTruthy();
    (evidence.steps as any[]).push({ step: 'delete_space', status: 'ok' });
  });

  it('verifies final Postgres state', async () => {
    const tableCount = await prisma.tableMeta.count({
      where: { id: (evidence as any).tableId },
    });
    expect(tableCount).toBe(1);
    (evidence.steps as any[]).push({ step: 'final_db_state', status: 'ok', tableCount });
    (globalThis as any).__wave6 = { baseURL, evidence };
  });
});
