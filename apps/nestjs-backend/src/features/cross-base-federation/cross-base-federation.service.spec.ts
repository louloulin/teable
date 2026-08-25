import {
  aliasMap,
  consumeEvents,
  defaultRefreshIntervalSeconds,
  finishRefresh,
  hasSources,
  isFederationRefreshMode,
  isFederationSourceKind,
  isFederationStatus,
  maxSourcesPerView,
  nextRefreshAt,
  normalizeSource,
  normalizeView,
  shouldRefreshNow,
  stalenessSeconds,
  startRefresh,
  validateSource,
  validateView,
} from './cross-base-federation.service';
import type {
  IFederationEvent,
  IFederationSource,
  IFederationView,
} from './cross-base-federation.types';
import { MAX_EVENTS_PER_REFRESH, MAX_SOURCES_PER_VIEW } from './cross-base-federation.types';

const baseView = (over: Partial<IFederationView> = {}): IFederationView => ({
  id: 'v1',
  orgId: 'o1',
  name: 'pipeline',
  description: 'cross-base pipeline view',
  status: 'active',
  refreshMode: 'event',
  refreshIntervalSeconds: 60,
  lastRefreshedBy: null,
  lastRefreshedAt: null,
  lastStalenessSeconds: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const baseSource = (over: Partial<IFederationSource> = {}): IFederationSource => ({
  id: 's1',
  baseId: 'b1',
  kind: 'table',
  targetId: 't1',
  alias: 'pipeline',
  fields: null,
  filter: null,
  ...over,
});

const baseEvent = (over: Partial<IFederationEvent> = {}): IFederationEvent => ({
  id: 'e1',
  viewId: 'v1',
  sourceId: 's1',
  kind: 'row.updated',
  occurredAt: '2026-01-01T00:00:00Z',
  summary: 'updated 12 rows',
  processed: false,
  ...over,
});

describe('cross-base-federation.isFederationStatus / SourceKind / RefreshMode', () => {
  it('accepts canonical', () => {
    expect(isFederationStatus('active')).toBe(true);
    expect(isFederationSourceKind('view')).toBe(true);
    expect(isFederationRefreshMode('interval')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isFederationStatus('archived')).toBe(false);
    expect(isFederationSourceKind('query')).toBe(false);
    expect(isFederationRefreshMode('realtime')).toBe(false);
  });
});

describe('cross-base-federation.defaultRefreshIntervalSeconds / maxSourcesPerView', () => {
  it('returns defaults', () => {
    expect(defaultRefreshIntervalSeconds()).toBe(60);
    expect(maxSourcesPerView()).toBe(MAX_SOURCES_PER_VIEW);
  });
});

describe('cross-base-federation.validateView', () => {
  it('passes healthy view', () => {
    expect(validateView(baseView())).toBeNull();
  });
  it('rejects missing id', () => {
    expect(validateView(baseView({ id: '' }))).toContain('id');
  });
  it('rejects missing orgId', () => {
    expect(validateView(baseView({ orgId: '' }))).toContain('orgId');
  });
  it('rejects missing name', () => {
    expect(validateView(baseView({ name: '' }))).toContain('name');
  });
  it('rejects unknown status', () => {
    expect(validateView(baseView({ status: 'gone' as never }))).toContain('status');
  });
  it('rejects unknown refreshMode', () => {
    expect(validateView(baseView({ refreshMode: 'live' as never }))).toContain('refreshMode');
  });
  it('rejects interval out of range', () => {
    expect(validateView(baseView({ refreshIntervalSeconds: 1 }))).toContain(
      'refreshIntervalSeconds'
    );
    expect(validateView(baseView({ refreshIntervalSeconds: 999_999 }))).toContain(
      'refreshIntervalSeconds'
    );
  });
});

describe('cross-base-federation.normalizeView', () => {
  it('defaults status + refreshMode + interval', () => {
    const v = normalizeView({ id: 'v1', orgId: 'o1', name: 'n' });
    expect(v.status).toBe('draft');
    expect(v.refreshMode).toBe('event');
    expect(v.refreshIntervalSeconds).toBe(60);
  });
  it('clamps interval', () => {
    const v = normalizeView({
      id: 'v1',
      orgId: 'o1',
      name: 'n',
      refreshIntervalSeconds: 999_999,
    });
    expect(v.refreshIntervalSeconds).toBeLessThanOrEqual(86_400);
  });
});

describe('cross-base-federation.validateSource / normalizeSource', () => {
  it('passes', () => {
    expect(validateSource(baseSource(), 'v1')).toBeNull();
  });
  it('rejects alias equal to view id', () => {
    expect(validateSource(baseSource({ id: 'v1' }), 'v1')).toContain('must differ');
  });
  it('rejects unknown kind', () => {
    expect(validateSource(baseSource({ kind: 'query' as never }), 'v1')).toContain('kind');
  });
  it('rejects too many fields', () => {
    const fields = Array.from({ length: 300 }, (_, i) => `f${i}`);
    expect(validateSource(baseSource({ fields }), 'v1')).toContain('fields');
  });
  it('normalize keeps nulls', () => {
    const s = normalizeSource({
      id: 's1',
      baseId: 'b1',
      kind: 'view',
      targetId: 'v2',
      alias: 'a',
    });
    expect(s.fields).toBeNull();
    expect(s.filter).toBeNull();
  });
});

describe('cross-base-federation.nextRefreshAt / stalenessSeconds', () => {
  it('nextRefreshAt null for event mode', () => {
    expect(nextRefreshAt({ view: baseView() })).toBeNull();
  });
  it('nextRefreshAt is last+interval for interval mode', () => {
    const eta = nextRefreshAt({
      view: baseView({
        refreshMode: 'interval',
        refreshIntervalSeconds: 60,
        lastRefreshedAt: '2026-01-01T00:00:00Z',
      }),
    });
    expect(eta?.startsWith('2026-01-01T00:01:00')).toBe(true);
  });
  it('stalenessSeconds null when not refreshed', () => {
    expect(stalenessSeconds({ view: baseView() })).toBeNull();
  });
  it('stalenessSeconds counts seconds since refresh', () => {
    expect(
      stalenessSeconds({
        view: baseView({ lastRefreshedAt: '2026-01-01T00:00:00Z' }),
        now: '2026-01-01T00:00:30Z',
      })
    ).toBe(30);
  });
});

describe('cross-base-federation.shouldRefreshNow', () => {
  it('false when paused', () => {
    expect(
      shouldRefreshNow({ view: baseView({ status: 'paused' }), pendingEvents: [baseEvent()] })
    ).toBe(false);
  });
  it('true for event mode with events', () => {
    expect(shouldRefreshNow({ view: baseView(), pendingEvents: [baseEvent()] })).toBe(true);
  });
  it('false for event mode with no events', () => {
    expect(shouldRefreshNow({ view: baseView(), pendingEvents: [] })).toBe(false);
  });
  it('false for manual mode', () => {
    expect(
      shouldRefreshNow({
        view: baseView({ refreshMode: 'manual' }),
        pendingEvents: [baseEvent()],
      })
    ).toBe(false);
  });
  it('true for interval mode past ETA', () => {
    expect(
      shouldRefreshNow({
        view: baseView({
          refreshMode: 'interval',
          refreshIntervalSeconds: 60,
          lastRefreshedAt: '2026-01-01T00:00:00Z',
        }),
        pendingEvents: [],
        now: '2026-01-01T00:02:00Z',
      })
    ).toBe(true);
  });
});

describe('cross-base-federation.startRefresh / finishRefresh', () => {
  it('starts running', () => {
    const j = startRefresh({ id: 'j1', viewId: 'v1' });
    expect(j.status).toBe('running');
  });
  it('finishes done with metrics', () => {
    const j = startRefresh({ id: 'j1', viewId: 'v1' });
    const done = finishRefresh({
      job: j,
      status: 'done',
      eventsConsumed: 10,
      rowsWritten: 50,
    });
    expect(done.status).toBe('done');
    expect(done.rowsWritten).toBe(50);
    expect(done.durationMs).toBeGreaterThanOrEqual(0);
  });
  it('finishes failed with error', () => {
    const j = startRefresh({ id: 'j1', viewId: 'v1' });
    const f = finishRefresh({
      job: j,
      status: 'failed',
      eventsConsumed: 0,
      rowsWritten: 0,
      error: 'source unreachable',
    });
    expect(f.lastError).toBe('source unreachable');
  });
});

describe('cross-base-federation.consumeEvents', () => {
  it('marks processed and slices', () => {
    const events = Array.from({ length: MAX_EVENTS_PER_REFRESH + 5 }, (_, i) =>
      baseEvent({ id: `e${i}` })
    );
    const consumed = consumeEvents({ events });
    expect(consumed.length).toBe(MAX_EVENTS_PER_REFRESH);
    expect(consumed[0]?.processed).toBe(true);
  });
});

describe('cross-base-federation.aliasMap / hasSources', () => {
  it('maps aliases', () => {
    const m = aliasMap([baseSource({ alias: 'a' }), baseSource({ id: 's2', alias: 'b' })]);
    expect(Object.keys(m).sort()).toEqual(['a', 'b']);
  });
  it('hasSources', () => {
    expect(hasSources({ sources: [], viewId: 'v1' })).toBe(false);
    expect(hasSources({ sources: [baseSource()], viewId: 'v1' })).toBe(true);
  });
});
