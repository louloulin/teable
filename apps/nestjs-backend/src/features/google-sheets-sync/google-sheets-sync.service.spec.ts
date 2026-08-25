/* eslint-disable @typescript-eslint/naming-convention */
import {
  buildChannelRow,
  buildMappingRow,
  buildSyncRecordRow,
  DEFAULT_HEADER_ROW,
  deriveAllowedMutations,
  foldRun,
  generateChannelId,
  hashFieldMap,
  hashRefreshToken,
  isValidDirection,
  isValidStatusTransition,
  parseCellValue,
  resolveConflict,
  stringifyFieldMap,
} from './google-sheets-sync.service';

describe('Google Sheets sync helpers (Stage 37)', () => {
  describe('hash / stringify', () => {
    it('hashRefreshToken is sha256 hex', () => {
      expect(hashRefreshToken('tok')).toMatch(/^[a-f0-9]{64}$/);
    });
    it('hashFieldMap is order-independent', () => {
      const a = hashFieldMap({ Name: 'fld_1', Email: 'fld_2' });
      const b = hashFieldMap({ Email: 'fld_2', Name: 'fld_1' });
      expect(a).toBe(b);
    });
    it('stringifyFieldMap sorts keys', () => {
      expect(stringifyFieldMap({ B: 'b', A: 'a' })).toBe('{"A":"a","B":"b"}');
    });
  });

  describe('direction / status', () => {
    it('isValidDirection accepts the three values', () => {
      expect(isValidDirection('one-way-push')).toBe(true);
      expect(isValidDirection('bi-directional')).toBe(true);
      expect(isValidDirection('weird')).toBe(false);
    });
    it('isValidStatusTransition follows the same table as Airtable', () => {
      expect(isValidStatusTransition('ready', 'paused')).toBe(true);
      expect(isValidStatusTransition('ready', 'ready')).toBe(false);
      expect(isValidStatusTransition('error', 'ready')).toBe(true);
    });
  });

  describe('deriveAllowedMutations', () => {
    it('one-way-push: can push, cannot pull', () => {
      const m = deriveAllowedMutations('one-way-push');
      expect(m.canPushLocalToRemote).toBe(true);
      expect(m.canPullRemoteToLocal).toBe(false);
      expect(m.canDeleteRemote).toBe(true);
    });
    it('one-way-pull: cannot push or delete remote', () => {
      const m = deriveAllowedMutations('one-way-pull');
      expect(m.canPushLocalToRemote).toBe(false);
      expect(m.canPullRemoteToLocal).toBe(true);
      expect(m.canDeleteRemote).toBe(false);
    });
    it('bi-directional: all allowed', () => {
      const m = deriveAllowedMutations('bi-directional');
      expect(m.canPushLocalToRemote).toBe(true);
      expect(m.canPullRemoteToLocal).toBe(true);
      expect(m.canCreate).toBe(true);
      expect(m.canDeleteRemote).toBe(true);
    });
  });

  describe('resolveConflict', () => {
    it('local newer → local wins, synced', () => {
      const r = resolveConflict({
        localUpdatedAt: new Date('2026-08-25T02:00:00Z'),
        remoteUpdatedAt: new Date('2026-08-25T01:00:00Z'),
      });
      expect(r).toEqual({ winner: 'local', nextState: 'synced' });
    });
    it('remote newer → remote wins, synced', () => {
      const r = resolveConflict({
        localUpdatedAt: new Date('2026-08-25T00:00:00Z'),
        remoteUpdatedAt: new Date('2026-08-25T05:00:00Z'),
      });
      expect(r).toEqual({ winner: 'remote', nextState: 'synced' });
    });
    it('tie → local wins by convention', () => {
      const t = new Date('2026-08-25T00:00:00Z');
      expect(resolveConflict({ localUpdatedAt: t, remoteUpdatedAt: t })).toEqual({
        winner: 'local',
        nextState: 'synced',
      });
    });
    it('both null → conflict for review', () => {
      expect(resolveConflict({ localUpdatedAt: null, remoteUpdatedAt: null })).toEqual({
        winner: 'tie',
        nextState: 'conflict',
      });
    });
  });

  describe('parseCellValue', () => {
    it('returns null for empty', () => {
      expect(parseCellValue('')).toBe(null);
    });
    it('strips leading single-quote', () => {
      expect(parseCellValue("'00123")).toBe('00123');
    });
    it('parses date serial', () => {
      // 25569 = 1970-01-01; 45292 = 2024-01-01
      const v = parseCellValue('45292');
      expect(typeof v).toBe('string');
      expect(v).toMatch(/^2024-01-01$/);
    });
    it('passes regular numbers through', () => {
      expect(parseCellValue('42')).toBe(42);
    });
    it('passes strings through', () => {
      expect(parseCellValue('hello')).toBe('hello');
    });
  });

  describe('buildMappingRow', () => {
    it('produces a row with fieldMap hash', () => {
      const r = buildMappingRow({
        id: 'm',
        connectionId: 'c',
        sheetId: 'sid',
        sheetTitle: 'Sheet1',
        sheetGid: 0,
        teableBaseId: 'b',
        teableTableId: 't',
        direction: 'bi-directional',
        fieldMap: { Name: 'fld_1' },
      });
      expect(r.fieldMapHash).toMatch(/^[a-f0-9]{64}$/);
      expect(r.status).toBe('ready');
      expect(r.headerRow).toBe(DEFAULT_HEADER_ROW);
    });
    it('honors custom header row', () => {
      const r = buildMappingRow({
        id: 'm',
        connectionId: 'c',
        sheetId: 's',
        sheetTitle: 'S',
        sheetGid: 0,
        teableBaseId: 'b',
        teableTableId: 't',
        direction: 'one-way-push',
        fieldMap: {},
        headerRow: 2,
      });
      expect(r.headerRow).toBe(2);
    });
  });

  describe('buildSyncRecordRow', () => {
    it('fills lastSyncedAt with now', () => {
      const r = buildSyncRecordRow({
        id: 'r',
        mappingId: 'm',
        record: { recordId: 'rec_1', sheetsRowNumber: 5, state: 'synced' },
        now: new Date('2026-08-25T00:00:00Z'),
      });
      expect(r.lastSyncedAt).toEqual(new Date('2026-08-25T00:00:00Z'));
      expect(r.state).toBe('synced');
    });
  });

  describe('generateChannelId / buildChannelRow', () => {
    it('produces gsheets- prefix + 24 hex', () => {
      expect(generateChannelId()).toMatch(/^gsheets-[a-f0-9]{24}$/);
    });
    it('buildChannelRow echoes expiration', () => {
      const r = buildChannelRow({
        resourceId: 'res',
        expiration: 1_700_000_000_000,
        mappingId: 'm',
        connectionId: 'c',
      });
      expect(r.expiration).toBe(1_700_000_000_000);
    });
  });

  describe('foldRun', () => {
    it('aggregates by state', () => {
      const out = foldRun({
        records: [
          { state: 'local-only' },
          { state: 'local-only' },
          { state: 'remote-only' },
          { state: 'conflict' },
          { state: 'synced' },
        ],
        hadFailure: false,
      });
      expect(out.total).toBe(5);
      expect(out.pushed).toBe(2);
      expect(out.pulled).toBe(1);
      expect(out.conflicts).toBe(1);
      expect(out.status).toBe('ok');
    });
    it('marks partial when failure + some progress', () => {
      const out = foldRun({
        records: [{ state: 'local-only' }, { state: 'conflict' }],
        hadFailure: true,
      });
      expect(out.status).toBe('partial');
    });
    it('marks failed when no progress at all', () => {
      const out = foldRun({ records: [], hadFailure: true });
      expect(out.status).toBe('failed');
    });
  });
});
