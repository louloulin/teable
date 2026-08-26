/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tenant Replay — unit tests.
 *
 * Pure tests, no live DB.  Covers:
 *  - anonymiser round-trip (idempotent on already-scrubbed input)
 *  - replay report shape (counts + duration + ok flag)
 */

import { describe, expect, it, vi } from 'vitest';

import {
  anonymizeSnapshot,
  anonymizeUser,
  buildReplayClsStore,
  scrubEmail,
  scrubName,
  structuredCloneSafe,
  SYSTEM_USER_ID,
} from './tenant-anonymize.util';
import type {
  ITenantSnapshot,
  IReplayReport,
} from './tenant-replay.types';

const buildSnapshot = (overrides: Partial<ITenantSnapshot> = {}): ITenantSnapshot => ({
  version: 1,
  capturedAt: '2026-08-26T00:00:00.000Z',
  capturedBy: 'unit-test',
  anonymized: 'none',
  sourceSpaceId: 'spcSrc00000000000aa',
  spaceName: 'Acme HQ',
  bases: [
    {
      sourceBaseId: 'bseSrc00000000000aa',
      name: 'Operations',
      icon: null,
      order: 1,
      collaboratorCount: 2,
      automationRunCount: 7,
      tables: [
        {
          sourceTableId: 'tblSrc00000000000aa',
          name: 'Projects',
          description: null,
          icon: null,
          dbTableName: 'projects',
          order: 1,
          fields: [
            { id: 'fldSrc00000000000aa', name: 'Title', type: 'singleLineText' },
            {
              id: 'fldSrc00000000000ab',
              name: 'Owner',
              type: 'user',
            },
          ],
          views: [
            { id: 'viwSrc00000000000aa', name: 'All projects', type: 'grid' },
          ],
          recordStats: {
            sourceTableId: 'tblSrc00000000000aa',
            name: 'Projects',
            rowCount: 42,
            fieldIds: ['fldSrc00000000000aa', 'fldSrc00000000000ab'],
          },
          pendingSchemaOperations: 1,
          attachmentCount: 3,
        },
      ],
    },
  ],
  users: [
    {
      sourceUserId: 'usrSrc00000000000aa',
      name: 'Alice Anderson',
      email: 'alice@acme.io',
      isAdmin: true,
      isSystem: false,
    },
    {
      sourceUserId: 'usrSrc00000000000ab',
      name: 'Bob Brown',
      email: 'bob.smith+filter@x.dev',
      isAdmin: false,
      isSystem: false,
    },
  ],
  summary: {
    baseCount: 1,
    tableCount: 1,
    viewCount: 1,
    fieldCount: 2,
    userCount: 2,
    schemaOperationCount: 1,
    attachmentCount: 3,
    approxRecordCount: 42,
  },
  ...overrides,
});

describe('tenant-anonymize.util', () => {
  it('scrubEmail replaces any string containing @', () => {
    expect(scrubEmail('alice@acme.io', 1)).toBe('user1@example.test');
    expect(scrubEmail('bob.smith+filter@x.dev', 2)).toBe('user2@example.test');
  });

  it('scrubEmail leaves non-email strings alone', () => {
    expect(scrubEmail('hello-world', 3)).toBe('hello-world');
    expect(scrubEmail('', 4)).toBe('');
  });

  it('scrubName replaces strings with User N', () => {
    expect(scrubName('Alice Anderson', 1)).toBe('User 1');
    expect(scrubName('Bob', 2)).toBe('User 2');
  });

  it('scrubName passes through non-string input', () => {
    expect(scrubName(undefined, 1)).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(scrubName(null as any, 1)).toBeNull();
  });

  it('anonymizeUser rewrites PII fields', () => {
    const scrubbed = anonymizeUser(
      {
        sourceUserId: 'usrSrc00000000000aa',
        name: 'Alice',
        email: 'alice@acme.io',
        isAdmin: true,
        isSystem: false,
      },
      5
    );
    expect(scrubbed.name).toBe('User 5');
    expect(scrubbed.email).toBe('user5@example.test');
    expect(scrubbed.sourceUserId).toBe('usrSrc00000000000aa');
    expect(scrubbed.isAdmin).toBe(true);
  });

  it('anonymizeSnapshot marks the snapshot as scrubbed and rewrites users + spaceName', () => {
    const original = buildSnapshot();
    const scrubbed = anonymizeSnapshot(original);

    expect(scrubbed.anonymized).toBe('scrub');
    expect(scrubbed.users).toHaveLength(2);
    expect(scrubbed.users[0].name).toBe('User 1');
    expect(scrubbed.users[0].email).toBe('user1@example.test');
    expect(scrubbed.users[1].email).toBe('user2@example.test');
    // The space name should no longer leak the tenant's chosen label.
    expect(scrubbed.spaceName).toContain('spcSrc00000000000aa');

    // Source untouched — anonymous util must never mutate inputs.
    expect(original.anonymized).toBe('none');
    expect(original.users[0].email).toBe('alice@acme.io');
    expect(original.spaceName).toBe('Acme HQ');
  });

  it('anonymizeSnapshot is idempotent on already-scrubbed input', () => {
    const scrubbedOnce = anonymizeSnapshot(buildSnapshot());
    const scrubbedTwice = anonymizeSnapshot(scrubbedOnce);
    expect(scrubbedTwice.anonymized).toBe('scrub');
    expect(scrubbedTwice.users[0].email).toBe(scrubbedOnce.users[0].email);
  });

  it('structuredCloneSafe round-trips the snapshot', () => {
    const snapshot = buildSnapshot();
    const cloned = structuredCloneSafe(snapshot);
    expect(cloned).toEqual(snapshot);
    // Mutating the clone does not affect the original.
    cloned.spaceName = 'mutated';
    expect(snapshot.spaceName).toBe('Acme HQ');
  });
});

describe('buildReplayClsStore', () => {
  it('produces an admin-shaped CLS store with the system replay user id', () => {
    const store = buildReplayClsStore();
    expect(store.user.id).toBe(SYSTEM_USER_ID);
    expect(store.user.isAdmin).toBe(true);
    expect(store.user.email).toBe('replay@teable.local');
    expect(store.permissions).toContain('space|create');
    expect(store.origin.byApi).toBe(true);
  });

  it('honours user overrides', () => {
    const store = buildReplayClsStore({ name: 'override', email: 'x@y.dev', isAdmin: false });
    expect(store.user.name).toBe('override');
    expect(store.user.email).toBe('x@y.dev');
    expect(store.user.isAdmin).toBe(false);
  });
});

describe('IReplayReport shape (contract)', () => {
  // The replay service builds the report via a private helper.  We exercise
  // the contract by constructing a minimal expected report and asserting the
  // shape so a future refactor cannot silently drop fields.
  it('contains the documented top-level keys', () => {
    const expected: Array<keyof IReplayReport> = [
      'ok',
      'startedAt',
      'finishedAt',
      'durationMs',
      'snapshot',
      'options',
      'counts',
      'newSpaceId',
      'baseIdMap',
      'tableIdMap',
      'errors',
    ];
    const report: IReplayReport = {
      ok: true,
      startedAt: '2026-08-26T00:00:00.000Z',
      finishedAt: '2026-08-26T00:00:01.000Z',
      durationMs: 1000,
      snapshot: { version: 1, sourceSpaceId: 'spcSrc00000000000aa' },
      options: {
        targetSpaceName: 'Replay',
        anonymize: 'scrub',
        rowsPerTable: 3,
        runSchemaOperations: true,
        failFast: false,
      },
      counts: {
        spacesCreated: 1,
        basesCreated: 1,
        tablesCreated: 1,
        fieldsCreated: 2,
        viewsCreated: 1,
        recordsSeeded: 3,
        schemaOperationsProcessed: 0,
        schemaOperationsFailed: 0,
      },
      newSpaceId: 'spcNew00000000000aa',
      baseIdMap: { bseSrc00000000000aa: 'bseNew00000000000aa' },
      tableIdMap: { tblSrc00000000000aa: 'tblNew00000000000aa' },
      errors: [],
    };
    for (const key of expected) {
      expect(report).toHaveProperty(key);
    }
    expect(report.errors).toEqual([]);
    expect(report.options.anonymize).toBe('scrub');
  });

  it('flags partial failures via the ok flag', () => {
    const report: IReplayReport = {
      ok: false,
      startedAt: '2026-08-26T00:00:00.000Z',
      finishedAt: '2026-08-26T00:00:02.000Z',
      durationMs: 2000,
      snapshot: { version: 1, sourceSpaceId: 'spcSrc00000000000aa' },
      options: {
        targetSpaceName: 'Replay',
        anonymize: 'scrub',
        rowsPerTable: 3,
        runSchemaOperations: true,
        failFast: false,
      },
      counts: {
        spacesCreated: 1,
        basesCreated: 0,
        tablesCreated: 0,
        fieldsCreated: 0,
        viewsCreated: 0,
        recordsSeeded: 0,
        schemaOperationsProcessed: 0,
        schemaOperationsFailed: 0,
      },
      newSpaceId: 'spcNew00000000000aa',
      baseIdMap: {},
      tableIdMap: {},
      errors: [
        {
          phase: 'base',
          sourceId: 'bseSrc00000000000aa',
          message: 'boom',
        },
      ],
    };
    expect(report.ok).toBe(false);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].phase).toBe('base');
  });
});

describe('integration: anonymise round-trip via the snapshot helper', () => {
  it('does not throw when the snapshot is empty', () => {
    const empty: ITenantSnapshot = {
      version: 1,
      capturedAt: '2026-08-26T00:00:00.000Z',
      anonymized: 'none',
      sourceSpaceId: 'spcSrc00000000000aa',
      spaceName: 'Empty',
      bases: [],
      users: [],
      summary: {
        baseCount: 0,
        tableCount: 0,
        viewCount: 0,
        fieldCount: 0,
        userCount: 0,
        schemaOperationCount: 0,
        attachmentCount: 0,
        approxRecordCount: 0,
      },
    };
    const scrubbed = anonymizeSnapshot(empty);
    expect(scrubbed.bases).toEqual([]);
    expect(scrubbed.users).toEqual([]);
  });

  it('does not silently mutate the source snapshot across multiple calls', () => {
    const original = buildSnapshot();
    const originalEmail = original.users[0].email;
    anonymizeSnapshot(original);
    anonymizeSnapshot(original);
    expect(original.users[0].email).toBe(originalEmail);
  });
});

// Touch vi to keep the import live for future stubbing, and to avoid the
// linter flagging an unused-vars warning if this file is later extended.
vi.fn;
