/* eslint-disable @typescript-eslint/naming-convention */
import {
  canStartSync,
  deriveSyncStatus,
  isManualRunAllowed,
  isTerminalStatus,
  isValidKind,
  isValidSchedule,
  isValidSyncMode,
  isValidSyncStatus,
  resolvePageSize,
  testConnectionConfig,
  validateConfigShape,
  validateCreateInput,
  validateStartSyncInput,
} from './db-connector.service';
import { DEFAULT_CONNECTOR_NAME_MAX_LENGTH, DEFAULT_PAGE_SIZE } from './db-connector.types';
import type { IDbConnector, IDbConnectorSync } from './db-connector.types';

function mkConnector(over: Partial<IDbConnector> = {}): IDbConnector {
  return {
    id: 'dbc_1',
    baseId: 'b1',
    name: 'pg-main',
    kind: 'postgres',
    encryptedConfigJson: '{}',
    schedule: '',
    targetTableId: 't1',
    enabled: true,
    createdTime: new Date(),
    updatedTime: new Date(),
    ...over,
  };
}

function mkSync(over: Partial<IDbConnectorSync> = {}): IDbConnectorSync {
  return {
    id: 'dbs_1',
    connectorId: 'dbc_1',
    mode: 'manual',
    status: 'success',
    rowsFetched: 100,
    rowsWritten: 100,
    startedAt: new Date(),
    finishedAt: new Date(),
    ...over,
  };
}

describe('db-connector.validators', () => {
  describe('isValidKind', () => {
    it('accepts all 8 kinds', () => {
      for (const k of [
        'postgres',
        'mysql',
        'mongodb',
        'bigquery',
        'snowflake',
        'rest-api',
        'notion',
        'airtable',
      ]) {
        expect(isValidKind(k)).toBe(true);
      }
    });
    it('rejects unknown', () => {
      expect(isValidKind('oracle')).toBe(false);
    });
  });

  describe('isValidSyncMode', () => {
    it('accepts full/incremental/manual', () => {
      expect(isValidSyncMode('full')).toBe(true);
      expect(isValidSyncMode('incremental')).toBe(true);
      expect(isValidSyncMode('manual')).toBe(true);
    });
    it('rejects unknown', () => {
      expect(isValidSyncMode('wat')).toBe(false);
    });
  });

  describe('isValidSyncStatus', () => {
    it('accepts all 6 statuses', () => {
      for (const s of ['pending', 'running', 'success', 'partial', 'failed', 'cancelled']) {
        expect(isValidSyncStatus(s)).toBe(true);
      }
    });
    it('rejects unknown', () => {
      expect(isValidSyncStatus('done')).toBe(false);
    });
  });

  describe('validateCreateInput', () => {
    it('passes a minimal valid postgres connector', () => {
      expect(() =>
        validateCreateInput({
          baseId: 'b1',
          name: 'pg',
          kind: 'postgres',
          config: {
            host: 'localhost',
            port: 5432,
            database: 'app',
            user: 'app',
            password: 'secret',
          },
        })
      ).not.toThrow();
    });

    it('rejects invalid kind', () => {
      expect(() =>
        validateCreateInput({
          baseId: 'b1',
          name: 'x',
          kind: 'wat',
          config: {},
        } as never)
      ).toThrow(/kind/);
    });

    it('requires baseId', () => {
      expect(() =>
        validateCreateInput({
          baseId: '',
          name: 'x',
          kind: 'postgres',
          config: { host: 'a' },
        })
      ).toThrow();
    });

    it('requires non-empty name', () => {
      expect(() =>
        validateCreateInput({
          baseId: 'b1',
          name: '   ',
          kind: 'postgres',
          config: { host: 'a' },
        })
      ).toThrow();
    });

    it('rejects too-long name', () => {
      expect(() =>
        validateCreateInput({
          baseId: 'b1',
          name: 'x'.repeat(DEFAULT_CONNECTOR_NAME_MAX_LENGTH + 1),
          kind: 'postgres',
          config: { host: 'a' },
        })
      ).toThrow(/name too long/);
    });
  });

  describe('validateConfigShape', () => {
    it('requires postgres host/port/database/user/password', () => {
      expect(() => validateConfigShape('postgres', {})).toThrow(/host/);
      expect(() =>
        validateConfigShape('postgres', {
          host: 'h',
          port: 5432,
          database: 'd',
          user: 'u',
        })
      ).toThrow(/password/);
    });

    it('requires rest-api url', () => {
      expect(() => validateConfigShape('rest-api', {})).toThrow(/url/);
    });

    it('requires airtable apiKey/baseId/tableId', () => {
      expect(() => validateConfigShape('airtable', { apiKey: 'k' })).toThrow(/baseId/);
    });

    it('requires notion integrationToken/databaseId', () => {
      expect(() => validateConfigShape('notion', { integrationToken: 't' })).toThrow(/databaseId/);
    });

    it('rejects non-object config', () => {
      expect(() => validateConfigShape('rest-api', null as never)).toThrow();
      expect(() => validateConfigShape('rest-api', [] as never)).toThrow();
    });

    it('rejects empty-string values', () => {
      expect(() => validateConfigShape('rest-api', { url: '' })).toThrow(/url/);
    });
  });

  describe('isValidSchedule', () => {
    it('accepts empty string (manual)', () => {
      expect(isValidSchedule('')).toBe(true);
    });

    it('accepts valid 5-field cron expressions', () => {
      expect(isValidSchedule('*/15 * * * *')).toBe(true);
      expect(isValidSchedule('0 0 * * *')).toBe(true);
      expect(isValidSchedule('0 9-17 * * 1-5')).toBe(true);
      expect(isValidSchedule('* * * * *')).toBe(true);
    });

    it('rejects wrong field count', () => {
      expect(isValidSchedule('* *')).toBe(false);
      expect(isValidSchedule('* * * * * *')).toBe(false);
    });

    it('rejects invalid field syntax', () => {
      expect(isValidSchedule('foo bar baz qux qux')).toBe(false);
    });
  });

  describe('validateStartSyncInput', () => {
    it('requires connectorId and triggeredBy', () => {
      expect(() => validateStartSyncInput({ connectorId: '', triggeredBy: 'u' })).toThrow();
      expect(() => validateStartSyncInput({ connectorId: 'c', triggeredBy: '' })).toThrow();
    });

    it('rejects invalid mode', () => {
      expect(() =>
        validateStartSyncInput({
          connectorId: 'c',
          triggeredBy: 'u',
          mode: 'wat' as never,
        })
      ).toThrow(/mode/);
    });

    it('passes with manual mode default', () => {
      expect(() => validateStartSyncInput({ connectorId: 'c', triggeredBy: 'u' })).not.toThrow();
    });
  });

  describe('canStartSync', () => {
    it('returns ok when enabled, bound, no running sync', () => {
      const c = mkConnector();
      expect(canStartSync(c, undefined)).toEqual({ ok: true });
    });

    it('rejects when connector is disabled', () => {
      const c = mkConnector({ enabled: false });
      expect(canStartSync(c, undefined)).toEqual({
        ok: false,
        reason: 'connector disabled',
      });
    });

    it('rejects when target table is unbound', () => {
      const c = mkConnector({ targetTableId: '' });
      expect(canStartSync(c, undefined).ok).toBe(false);
    });

    it('rejects when last sync is running', () => {
      const c = mkConnector();
      const s = mkSync({ status: 'running' });
      expect(canStartSync(c, s)).toEqual({
        ok: false,
        reason: 'sync already running',
      });
    });

    it('rejects when last sync finishedAt is in the future', () => {
      const c = mkConnector();
      const future = new Date(Date.now() + 60_000);
      const s = mkSync({ finishedAt: future });
      const r = canStartSync(c, s);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/future/);
    });

    it('accepts when last sync is terminal', () => {
      const c = mkConnector();
      const s = mkSync({ status: 'success' });
      expect(canStartSync(c, s).ok).toBe(true);
    });
  });

  describe('deriveSyncStatus', () => {
    it('failed when error present regardless of counts', () => {
      expect(deriveSyncStatus(100, 0, true)).toBe('failed');
    });

    it('success when rowsWritten equals rowsFetched', () => {
      expect(deriveSyncStatus(100, 100, false)).toBe('success');
    });

    it('partial when rowsWritten < rowsFetched', () => {
      expect(deriveSyncStatus(100, 50, false)).toBe('partial');
    });

    it('success on zero-row sync (no-op)', () => {
      expect(deriveSyncStatus(0, 0, false)).toBe('success');
    });
  });

  describe('resolvePageSize', () => {
    it('returns DEFAULT when unset', () => {
      expect(resolvePageSize({})).toBe(DEFAULT_PAGE_SIZE);
    });
    it('clamps to 5000', () => {
      expect(resolvePageSize({ pageSize: 100000 })).toBe(5000);
    });
    it('falls back when negative/zero', () => {
      expect(resolvePageSize({ pageSize: 0 })).toBe(DEFAULT_PAGE_SIZE);
      expect(resolvePageSize({ pageSize: -5 })).toBe(DEFAULT_PAGE_SIZE);
    });
    it('accepts a valid size', () => {
      expect(resolvePageSize({ pageSize: 500 })).toBe(500);
    });
  });

  describe('testConnectionConfig', () => {
    it('returns ok=true for a valid config', () => {
      const r = testConnectionConfig({
        kind: 'rest-api',
        config: { url: 'https://api.example.com' },
      });
      expect(r.ok).toBe(true);
      expect(r.latencyMs).toBe(-1);
      expect(r.error).toBeUndefined();
    });

    it('returns ok=false with error message for invalid config', () => {
      const r = testConnectionConfig({
        kind: 'rest-api',
        config: {},
      });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/url/);
    });
  });

  describe('isTerminalStatus + isManualRunAllowed', () => {
    it('flags terminal states', () => {
      expect(isTerminalStatus('success')).toBe(true);
      expect(isTerminalStatus('partial')).toBe(true);
      expect(isTerminalStatus('failed')).toBe(true);
      expect(isTerminalStatus('cancelled')).toBe(true);
      expect(isTerminalStatus('running')).toBe(false);
      expect(isTerminalStatus('pending')).toBe(false);
    });

    it('isManualRunAllowed when no prior sync', () => {
      expect(isManualRunAllowed(undefined)).toBe(true);
    });
    it('isManualRunAllowed when prior sync terminal', () => {
      expect(isManualRunAllowed(mkSync({ status: 'success' }))).toBe(true);
    });
    it('forbids when prior sync still running', () => {
      expect(isManualRunAllowed(mkSync({ status: 'running' }))).toBe(false);
    });
  });
});
