import {
  buildPolicyRow,
  buildRegionRow,
  isValidRegionCode,
  isValidStatusTransition,
  normalizeRegionFromHeader,
  parseRegionHeader,
  resolveRegionRoute,
} from './data-residency.service';
import type { IDataResidencyPolicy, IRegion } from './data-residency.types';

const policy = (over: Partial<IDataResidencyPolicy>): IDataResidencyPolicy => ({
  id: 'p',
  organizationId: 'o1',
  regionCode: 'eu',
  locked: false,
  updatedBy: 'u',
  updatedTime: new Date(),
  ...over,
});

const region = (over: Partial<IRegion>): IRegion => ({
  id: 'r',
  code: 'eu',
  displayName: 'EU',
  status: 'active',
  dataCenterLocation: null,
  createdTime: new Date(),
  updatedTime: new Date(),
  ...over,
});

describe('Data Residency helpers (Stage 34)', () => {
  describe('isValidRegionCode / parseRegionHeader / normalizeRegionFromHeader', () => {
    it('isValidRegionCode accepts 2-letter codes', () => {
      expect(isValidRegionCode('eu')).toBe(true);
      expect(isValidRegionCode('US')).toBe(false);
      expect(isValidRegionCode('eur')).toBe(false);
      expect(isValidRegionCode('e1')).toBe(false);
    });

    it('parseRegionHeader pulls x-teable-region (case-insensitive)', () => {
      expect(parseRegionHeader({ 'x-teable-region': 'eu' })).toBe('eu');
      expect(parseRegionHeader({ 'X-Teable-Region': 'eu' })).toBe('eu');
      expect(parseRegionHeader({})).toBeNull();
      expect(parseRegionHeader(null)).toBeNull();
      expect(parseRegionHeader({ 'x-teable-region': ['eu', 'us'] })).toBe('eu');
    });

    it('normalizeRegionFromHeader trims + lowercases + validates', () => {
      expect(normalizeRegionFromHeader(' EU ')).toBe('eu');
      expect(normalizeRegionFromHeader('eu-1')).toBeNull();
      expect(normalizeRegionFromHeader(null)).toBeNull();
      expect(normalizeRegionFromHeader('')).toBeNull();
    });
  });

  describe('resolveRegionRoute', () => {
    it('same-region is allowed', () => {
      const r = resolveRegionRoute({
        requestRegion: 'eu',
        policy: policy({ regionCode: 'eu' }),
        targetRegion: null,
      });
      expect(r.allowed).toBe(true);
      expect(r.reason).toBe('same-region');
    });

    it('missing policy denies', () => {
      const r = resolveRegionRoute({ requestRegion: 'eu', policy: null, targetRegion: null });
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('no-policy');
    });

    it('bad region code denies as unknown-region', () => {
      const r = resolveRegionRoute({
        requestRegion: 'eur',
        policy: policy({ regionCode: 'eu' }),
        targetRegion: null,
      });
      expect(r.reason).toBe('unknown-region');
    });

    it('locked policy denies cross-region', () => {
      const r = resolveRegionRoute({
        requestRegion: 'us',
        policy: policy({ regionCode: 'eu', locked: true }),
        targetRegion: region({ code: 'us', status: 'active' }),
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('policy-locked');
    });

    it('unlocked policy + active target allows cross-region', () => {
      const r = resolveRegionRoute({
        requestRegion: 'us',
        policy: policy({ regionCode: 'eu', locked: false }),
        targetRegion: region({ code: 'us', status: 'active' }),
      });
      expect(r.allowed).toBe(true);
      expect(r.reason).toBe('target-active');
    });

    it('draining target denies', () => {
      const r = resolveRegionRoute({
        requestRegion: 'us',
        policy: policy({ regionCode: 'eu' }),
        targetRegion: region({ code: 'us', status: 'draining' }),
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('target-draining');
    });

    it('offline target denies', () => {
      const r = resolveRegionRoute({
        requestRegion: 'us',
        policy: policy({ regionCode: 'eu' }),
        targetRegion: region({ code: 'us', status: 'offline' }),
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('target-draining');
    });

    it('unknown target denies', () => {
      const r = resolveRegionRoute({
        requestRegion: 'us',
        policy: policy({ regionCode: 'eu' }),
        targetRegion: null,
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('unknown-region');
    });
  });

  describe('isValidStatusTransition', () => {
    it('allows active → draining / offline', () => {
      expect(isValidStatusTransition('active', 'draining')).toBe(true);
      expect(isValidStatusTransition('active', 'offline')).toBe(true);
    });

    it('allows draining → active / offline', () => {
      expect(isValidStatusTransition('draining', 'active')).toBe(true);
      expect(isValidStatusTransition('draining', 'offline')).toBe(true);
    });

    it('allows offline → active only', () => {
      expect(isValidStatusTransition('offline', 'active')).toBe(true);
      expect(isValidStatusTransition('offline', 'draining')).toBe(false);
    });

    it('rejects identical transitions', () => {
      expect(isValidStatusTransition('active', 'active')).toBe(false);
    });
  });

  describe('buildPolicyRow / buildRegionRow', () => {
    it('buildPolicyRow preserves fields', () => {
      const r = buildPolicyRow({
        id: 'p',
        organizationId: 'o',
        regionCode: 'eu',
        locked: true,
        updatedBy: 'u',
      });
      expect(r.locked).toBe(true);
    });

    it('buildRegionRow defaults status to active', () => {
      const r = buildRegionRow({ id: 'r', code: 'eu', displayName: 'EU' });
      expect(r.status).toBe('active');
      expect(r.dataCenterLocation).toBeNull();
    });
  });
});
