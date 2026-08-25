/* eslint-disable @typescript-eslint/naming-convention */
import {
  batchRecords,
  buildBatchResult,
  computeLag,
  nextRecordId,
  nextSeq,
  pickNextStandby,
  summarizeLags,
  validateMirrorConfig,
} from './workspace-mirror.service';
import type { IMirrorConfig, IMirrorLag, IMirrorLogRecord } from './workspace-mirror.types';

const baseCfg: IMirrorConfig = {
  baseId: 'b1',
  primary: { region: 'us-east', url: 'https://primary.example.com', priority: 0 },
  standbys: [
    { region: 'eu-west', url: 'https://eu.example.com', priority: 0 },
    { region: 'ap-south', url: 'https://ap.example.com', priority: 1 },
  ],
  maxLagSeconds: 30,
  batchSize: 50,
  enabled: true,
};

const makeRecord = (seq: number, region: string): IMirrorLogRecord => ({
  id: `r${seq}`,
  baseId: 'b1',
  region,
  kind: 'record.update',
  payload: { seq },
  seq,
  recordedAt: '2026-01-01T00:00:00Z',
});

describe('workspace-mirror.nextRecordId', () => {
  it('produces a stable shape with monotonic counter', () => {
    const id1 = nextRecordId(1, 'us-east', new Date('2026-01-01T00:00:00Z'));
    const id2 = nextRecordId(2, 'us-east', new Date('2026-01-01T00:00:00Z'));
    expect(id1).toMatch(/^[0-9a-z]{9}-[0-9a-z]{4}-us-east$/);
    expect(id1.endsWith('-us-east')).toBe(true);
    expect(id1).not.toBe(id2);
  });
});

describe('workspace-mirror.nextSeq', () => {
  it('increments by 1', () => {
    expect(nextSeq(0)).toBe(1);
    expect(nextSeq(99)).toBe(100);
  });
});

describe('workspace-mirror.validateMirrorConfig', () => {
  it('accepts a healthy config', () => {
    expect(validateMirrorConfig(baseCfg)).toEqual([]);
  });
  it('rejects missing baseId / primary', () => {
    expect(validateMirrorConfig({ ...baseCfg, baseId: '' }).length).toBeGreaterThan(0);
    expect(
      validateMirrorConfig({ ...baseCfg, primary: { ...baseCfg.primary, url: '' } }).length
    ).toBeGreaterThan(0);
  });
  it('rejects empty standbys', () => {
    expect(validateMirrorConfig({ ...baseCfg, standbys: [] })).toContain(
      'at least one standby is required'
    );
  });
  it('rejects duplicate primary region', () => {
    const errs = validateMirrorConfig({
      ...baseCfg,
      standbys: [{ region: 'us-east', url: 'x', priority: 1 }],
    });
    expect(errs.join(' ')).toContain('duplicates primary');
  });
  it('rejects out-of-range batch size', () => {
    expect(validateMirrorConfig({ ...baseCfg, batchSize: 0 }).length).toBeGreaterThan(0);
    expect(validateMirrorConfig({ ...baseCfg, batchSize: 5000 }).length).toBeGreaterThan(0);
  });
});

describe('workspace-mirror.batchRecords', () => {
  it('chunks records preserving seq order', () => {
    const records = Array.from({ length: 12 }, (_, i) => makeRecord(i + 1, 'us-east'));
    const batches = batchRecords(records, 5);
    expect(batches).toHaveLength(3);
    expect(batches[0]?.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(batches[2]?.map((r) => r.seq)).toEqual([11, 12]);
  });
  it('returns [] for batchSize <= 0', () => {
    expect(batchRecords([makeRecord(1, 'us-east')], 0)).toEqual([]);
  });
});

describe('workspace-mirror.buildBatchResult', () => {
  it('captures from/to seq + record count', () => {
    const records = [makeRecord(5, 'us-east'), makeRecord(6, 'us-east'), makeRecord(7, 'us-east')];
    const res = buildBatchResult({
      batchId: 'b1',
      region: 'eu-west',
      records,
      acknowledged: true,
      now: new Date('2026-01-01T00:00:00Z'),
    });
    expect(res.fromSeq).toBe(5);
    expect(res.toSeq).toBe(7);
    expect(res.recordCount).toBe(3);
    expect(res.shippedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(res.acknowledged).toBe(true);
  });
  it('returns 0..0 for an empty batch', () => {
    const res = buildBatchResult({
      batchId: 'b1',
      region: 'eu-west',
      records: [],
      acknowledged: false,
    });
    expect(res.fromSeq).toBe(0);
    expect(res.toSeq).toBe(0);
    expect(res.recordCount).toBe(0);
  });
});

describe('workspace-mirror.computeLag', () => {
  const now = new Date('2026-01-01T00:00:30Z');
  it('classifies a fresh streaming lag', () => {
    const lag = computeLag({
      region: 'eu-west',
      lastAckSeq: 100,
      primarySeq: 105,
      shippedAt: new Date(now.getTime() - 5000).toISOString(),
      maxLagSeconds: 30,
      now,
    });
    expect(lag.status).toBe('streaming');
    expect(lag.seqLag).toBe(5);
  });
  it('classifies zero seq lag as idle', () => {
    const lag = computeLag({
      region: 'eu-west',
      lastAckSeq: 100,
      primarySeq: 100,
      shippedAt: now.toISOString(),
      maxLagSeconds: 30,
      now,
    });
    expect(lag.status).toBe('idle');
  });
  it('classifies wall-clock > 4×maxLagSeconds as paused', () => {
    const lag = computeLag({
      region: 'eu-west',
      lastAckSeq: 50,
      primarySeq: 60,
      shippedAt: new Date(now.getTime() - 1000 * 60 * 5).toISOString(),
      maxLagSeconds: 30,
      now,
    });
    expect(lag.status).toBe('paused');
  });
  it('classifies null shippedAt as broken', () => {
    const lag = computeLag({
      region: 'eu-west',
      lastAckSeq: 0,
      primarySeq: 50,
      shippedAt: null,
      maxLagSeconds: 30,
      now,
    });
    expect(lag.status).toBe('broken');
  });
});

describe('workspace-mirror.summarizeLags', () => {
  it('safeToPromote only when all standbys are idle/streaming and enabled', () => {
    const idle: IMirrorLag = {
      region: 'eu-west',
      lastAckSeq: 10,
      primarySeq: 10,
      seqLag: 0,
      secondsLag: 1,
      status: 'idle',
    };
    const streaming: IMirrorLag = { ...idle, status: 'streaming', seqLag: 5 };
    expect(summarizeLags(baseCfg, [idle, streaming]).safeToPromote).toBe(true);
    expect(summarizeLags(baseCfg, [idle, { ...streaming, status: 'lagging' }]).safeToPromote).toBe(
      false
    );
    expect(summarizeLags({ ...baseCfg, enabled: false }, [idle, streaming]).safeToPromote).toBe(
      false
    );
  });
  it('returns false when fewer lags than standbys', () => {
    const idle: IMirrorLag = {
      region: 'eu-west',
      lastAckSeq: 10,
      primarySeq: 10,
      seqLag: 0,
      secondsLag: 1,
      status: 'idle',
    };
    expect(summarizeLags(baseCfg, [idle]).safeToPromote).toBe(false);
  });
});

describe('workspace-mirror.pickNextStandby', () => {
  it('round-robins by priority', () => {
    const standbys = [
      { region: 'eu-west', priority: 0 },
      { region: 'ap-south', priority: 1 },
    ];
    expect(pickNextStandby(standbys, 0)?.region).toBe('eu-west');
    expect(pickNextStandby(standbys, 1)?.region).toBe('ap-south');
    expect(pickNextStandby(standbys, 2)?.region).toBe('eu-west');
  });
  it('handles negative cursors', () => {
    const standbys = [
      { region: 'eu-west', priority: 0 },
      { region: 'ap-south', priority: 1 },
    ];
    expect(pickNextStandby(standbys, -1)?.region).toBe('ap-south');
  });
  it('returns null when no standbys', () => {
    expect(pickNextStandby([], 0)).toBeNull();
  });
});
