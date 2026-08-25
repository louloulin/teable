/* eslint-disable @typescript-eslint/naming-convention */
import {
  applyMappingUpdate,
  buildMappingRow,
  buildSyncRecordId,
  deriveAllowedMutations,
  foldSyncRecords,
  hashFieldMap,
  isFieldMapStale,
  isValidDirection,
  isValidStatusTransition,
  parseFieldMap,
  resolveConflict,
  stringifyFieldMap,
} from './airtable-sync.service';

describe('Airtable Sync helpers (Stage 36)', () => {
  describe('fieldMap hash + JSON', () => {
    it('hashFieldMap is order-independent', () => {
      const a = hashFieldMap({ Name: 'fld_1', Email: 'fld_2' });
      const b = hashFieldMap({ Email: 'fld_2', Name: 'fld_1' });
      expect(a).toBe(b);
      expect(a).toMatch(/^[a-f0-9]{64}$/);
    });

    it('hashFieldMap changes on value change', () => {
      expect(hashFieldMap({ Name: 'fld_1' })).not.toBe(hashFieldMap({ Name: 'fld_99' }));
    });

    it('stringifyFieldMap produces stable JSON', () => {
      const s = stringifyFieldMap({ B: '2', A: '1' });
      expect(s).toBe('{"A":"1","B":"2"}');
    });

    it('parseFieldMap roundtrips', () => {
      const s = stringifyFieldMap({ a: 'x', b: 'y' });
      const p = parseFieldMap(s);
      expect(p).toEqual({ a: 'x', b: 'y' });
    });

    it('parseFieldMap rejects non-object', () => {
      expect(() => parseFieldMap('"hello"')).toThrow();
      expect(() => parseFieldMap('[1,2]')).toThrow();
    });

    it('parseFieldMap rejects non-string values', () => {
      expect(() => parseFieldMap('{"a":1}')).toThrow();
    });
  });

  describe('direction + status', () => {
    it('isValidDirection', () => {
      expect(isValidDirection('bi-directional')).toBe(true);
      expect(isValidDirection('one-way-push')).toBe(true);
      expect(isValidDirection('nope')).toBe(false);
    });

    it('isValidStatusTransition', () => {
      expect(isValidStatusTransition('ready', 'paused')).toBe(true);
      expect(isValidStatusTransition('ready', 'ready')).toBe(false);
      expect(isValidStatusTransition('paused', 'ready')).toBe(true);
      expect(isValidStatusTransition('error', 'paused')).toBe(true);
    });
  });

  describe('buildMappingRow / applyMappingUpdate', () => {
    it('buildMappingRow defaults direction/status', () => {
      const r = buildMappingRow({
        id: 'm',
        connectionId: 'c',
        airtableTableId: 'atbl',
        airtableTableName: 'Projects',
        teableBaseId: 'b',
        teableTableId: 'tbl',
        fieldMap: { Name: 'fld_1' },
      });
      expect(r.direction).toBe('bi-directional');
      expect(r.status).toBe('ready');
      expect(r.fieldMapHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('buildMappingRow respects explicit direction', () => {
      const r = buildMappingRow({
        id: 'm',
        connectionId: 'c',
        airtableTableId: 'atbl',
        airtableTableName: 'X',
        teableBaseId: 'b',
        teableTableId: 'tbl',
        direction: 'one-way-pull',
        fieldMap: {},
      });
      expect(r.direction).toBe('one-way-pull');
    });

    it('applyMappingUpdate keeps fieldMap when omitted', () => {
      const base = buildMappingRow({
        id: 'm',
        connectionId: 'c',
        airtableTableId: 'atbl',
        airtableTableName: 'X',
        teableBaseId: 'b',
        teableTableId: 'tbl',
        fieldMap: { Name: 'fld_1' },
      });
      const merged = applyMappingUpdate(base, { status: 'paused' });
      expect(merged.fieldMapJson).toBe(base.fieldMapJson);
      expect(merged.status).toBe('paused');
    });

    it('applyMappingUpdate recomputes hash on new fieldMap', () => {
      const base = buildMappingRow({
        id: 'm',
        connectionId: 'c',
        airtableTableId: 'atbl',
        airtableTableName: 'X',
        teableBaseId: 'b',
        teableTableId: 'tbl',
        fieldMap: { Name: 'fld_1' },
      });
      const merged = applyMappingUpdate(base, { fieldMap: { Name: 'fld_1', Email: 'fld_2' } });
      expect(merged.fieldMapHash).not.toBe(base.fieldMapHash);
    });
  });

  describe('deriveAllowedMutations', () => {
    it('one-way-push: write to remote only', () => {
      const r = deriveAllowedMutations({ direction: 'one-way-push' });
      expect(r.canPushLocalToRemote).toBe(true);
      expect(r.canPullRemoteToLocal).toBe(false);
      expect(r.canDeleteRemote).toBe(false);
    });

    it('one-way-pull: read from remote only', () => {
      const r = deriveAllowedMutations({ direction: 'one-way-pull' });
      expect(r.canPullRemoteToLocal).toBe(true);
      expect(r.canPushLocalToRemote).toBe(false);
      expect(r.canCreate).toBe(false);
    });

    it('bi-directional: full', () => {
      const r = deriveAllowedMutations({ direction: 'bi-directional' });
      expect(r.canPushLocalToRemote).toBe(true);
      expect(r.canPullRemoteToLocal).toBe(true);
      expect(r.canCreate).toBe(true);
    });
  });

  describe('resolveConflict', () => {
    it('remote wins on higher version', () => {
      expect(
        resolveConflict({
          airtableRecordId: 'r',
          teableRecordId: 'l',
          remoteVersion: 5,
          localVersion: 3,
          contentHash: 'h',
        }).winner
      ).toBe('remote');
    });

    it('local wins on higher version', () => {
      expect(
        resolveConflict({
          airtableRecordId: 'r',
          teableRecordId: 'l',
          remoteVersion: 2,
          localVersion: 4,
          contentHash: 'h',
        }).winner
      ).toBe('local');
    });

    it('tie → conflict', () => {
      const r = resolveConflict({
        airtableRecordId: 'r',
        teableRecordId: 'l',
        remoteVersion: 3,
        localVersion: 3,
        contentHash: 'h',
      });
      expect(r.winner).toBe('tie');
      expect(r.nextState).toBe('conflict');
    });
  });

  describe('foldSyncRecords', () => {
    it('counts by state', () => {
      const summary = foldSyncRecords([
        {
          id: '1',
          mappingId: 'm',
          airtableRecordId: 'a',
          teableRecordId: 'l',
          state: 'synced',
          lastRemoteVersion: 1,
          lastLocalVersion: 1,
          lastSyncedAt: null,
          lastHash: null,
        },
        {
          id: '2',
          mappingId: 'm',
          airtableRecordId: 'a2',
          teableRecordId: 'l2',
          state: 'synced',
          lastRemoteVersion: 1,
          lastLocalVersion: 1,
          lastSyncedAt: null,
          lastHash: null,
        },
        {
          id: '3',
          mappingId: 'm',
          airtableRecordId: 'a3',
          teableRecordId: 'l3',
          state: 'remote-only',
          lastRemoteVersion: 1,
          lastLocalVersion: null,
          lastSyncedAt: null,
          lastHash: null,
        },
        {
          id: '4',
          mappingId: 'm',
          airtableRecordId: 'a4',
          teableRecordId: 'l4',
          state: 'conflict',
          lastRemoteVersion: 2,
          lastLocalVersion: 1,
          lastSyncedAt: null,
          lastHash: null,
        },
      ]);
      expect(summary).toEqual({ total: 4, synced: 2, remoteOnly: 1, localOnly: 0, conflicts: 1 });
    });

    it('empty → zero counts', () => {
      expect(foldSyncRecords([])).toEqual({
        total: 0,
        synced: 0,
        remoteOnly: 0,
        localOnly: 0,
        conflicts: 0,
      });
    });
  });

  describe('isFieldMapStale', () => {
    it('flags mismatch', () => {
      expect(
        isFieldMapStale({ currentHash: hashFieldMap({ A: '1' }), incomingMap: { A: '2' } })
      ).toBe(true);
    });

    it('passes when same', () => {
      expect(
        isFieldMapStale({ currentHash: hashFieldMap({ A: '1' }), incomingMap: { A: '1' } })
      ).toBe(false);
    });
  });

  describe('buildSyncRecordId', () => {
    it('is deterministic + 24 hex chars', () => {
      const id = buildSyncRecordId({ mappingId: 'm', airtableRecordId: 'r', teableRecordId: 'l' });
      expect(id).toMatch(/^[a-f0-9]{24}$/);
      expect(id).toBe(
        buildSyncRecordId({ mappingId: 'm', airtableRecordId: 'r', teableRecordId: 'l' })
      );
    });
  });
});
