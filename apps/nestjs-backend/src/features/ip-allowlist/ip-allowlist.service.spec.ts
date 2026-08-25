import {
  coerceMode,
  decide,
  extractClientIp,
  ipInCidr,
  parseCidr,
  parseIp,
} from './ip-allowlist.service';
import type { IIpAllowlistEntry } from './ip-allowlist.types';

describe('IP allowlist helpers (Stage 25)', () => {
  describe('parseIp', () => {
    it('parses IPv4', () => {
      expect(Array.from(parseIp('10.0.0.1')!)).toEqual([10, 0, 0, 1]);
    });
    it('parses IPv6', () => {
      const b = parseIp('2001:db8::1')!;
      expect(b[0]).toBe(0x20);
      expect(b[1]).toBe(0x01);
      expect(b[15]).toBe(0x01);
    });
    it('parses ::1 (loopback)', () => {
      const b = parseIp('::1')!;
      expect(b[15]).toBe(1);
    });
    it('rejects malformed IPv4', () => {
      expect(parseIp('10.0.0')).toBeNull();
      expect(parseIp('10.0.0.256')).toBeNull();
    });
    it('rejects malformed IPv6', () => {
      expect(parseIp('2001:db8::xyz')).toBeNull();
    });
  });

  describe('parseCidr', () => {
    it('parses IPv4 CIDR', () => {
      const c = parseCidr('10.0.0.0/24');
      expect(c.family).toBe(4);
      expect(c.prefix).toBe(24);
    });
    it('parses IPv6 CIDR', () => {
      const c = parseCidr('2001:db8::/32');
      expect(c.family).toBe(6);
      expect(c.prefix).toBe(32);
    });
    it('rejects invalid prefix', () => {
      expect(() => parseCidr('10.0.0.0/33')).toThrow(/prefix/);
      expect(() => parseCidr('10.0.0.0/-1')).toThrow();
    });
    it('rejects missing prefix', () => {
      expect(() => parseCidr('10.0.0.0')).toThrow();
    });
  });

  describe('ipInCidr', () => {
    it('matches an IP inside a /24', () => {
      expect(ipInCidr('10.0.0.5', '10.0.0.0/24')).toBe(true);
      expect(ipInCidr('10.0.1.5', '10.0.0.0/24')).toBe(false);
    });
    it('matches the network address itself', () => {
      expect(ipInCidr('10.0.0.0', '10.0.0.0/24')).toBe(true);
    });
    it('matches an IPv6 address in a /64', () => {
      expect(ipInCidr('2001:db8::1', '2001:db8::/64')).toBe(true);
      expect(ipInCidr('2001:db8:0:1::1', '2001:db8::/64')).toBe(false);
    });
    it('treats IPv4-mapped IPv6 as IPv4', () => {
      expect(ipInCidr('::ffff:10.0.0.5', '10.0.0.0/24')).toBe(true);
    });
    it('rejects garbage', () => {
      expect(ipInCidr('not-an-ip', '10.0.0.0/24')).toBe(false);
    });
  });

  describe('decide', () => {
    const entries: IIpAllowlistEntry[] = [
      { id: 'e1', organizationId: 'o1', cidr: '10.0.0.0/8', mode: 'block', note: null },
      { id: 'e2', organizationId: 'o1', cidr: '192.168.0.0/16', mode: 'audit', note: null },
    ];

    it('allows when the entry list is empty', () => {
      expect(decide({ ip: '10.0.0.1', entries: [] }).allowed).toBe(true);
    });

    it('blocks when an IP matches a block-mode entry', () => {
      const r = decide({ ip: '10.5.0.1', entries });
      expect(r.allowed).toBe(false);
      expect(r.blocked).toBe(true);
      expect(r.matchedEntryId).toBe('e1');
    });

    it('audits without blocking when matched in audit mode', () => {
      const r = decide({ ip: '192.168.1.1', entries });
      expect(r.allowed).toBe(true);
      expect(r.audited).toBe(true);
      expect(r.matchedEntryId).toBe('e2');
    });

    it('allows non-matching IPs', () => {
      const r = decide({ ip: '8.8.8.8', entries });
      expect(r.allowed).toBe(true);
      expect(r.audited).toBe(false);
      expect(r.blocked).toBe(false);
      expect(r.matchedEntryId).toBeNull();
    });
  });

  describe('extractClientIp', () => {
    it('extracts the first IP from X-Forwarded-For', () => {
      expect(extractClientIp({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })).toBe('1.2.3.4');
    });
    it('falls back to X-Real-IP', () => {
      expect(extractClientIp({ 'x-real-ip': '9.9.9.9' })).toBe('9.9.9.9');
    });
    it('returns null when neither header is present', () => {
      expect(extractClientIp({})).toBeNull();
    });
  });

  describe('coerceMode', () => {
    it('defaults to block for unknown values', () => {
      expect(coerceMode('block')).toBe('block');
      expect(coerceMode('audit')).toBe('audit');
      expect(coerceMode(null)).toBe('block');
      expect(coerceMode('something-else')).toBe('block');
    });
  });
});
