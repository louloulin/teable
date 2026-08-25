/* eslint-disable @typescript-eslint/naming-convention */
import {
  applyUpdate,
  buildPageRow,
  generatePageToken,
  hashPageToken,
  isTokenActive,
  parseBlocks,
  parseTheme,
  renumberBlocks,
  resolveVisibility,
  stringifyBlocks,
  validateBlock,
  validateBlocks,
  validateCreateInput,
  validateSlug,
  verifyToken,
} from './page-designer.service';
import type { IPageBlock, IPageDefinition, IPageToken } from './page-designer.types';

const baseInput = {
  baseId: 'b1',
  name: 'My Page',
  slug: 'my-page',
  createdBy: 'u1',
  blocks: [
    { id: 'b1', type: 'heading' as const, text: 'Hi', level: 1 as const, order: 0 },
    { id: 'b2', type: 'text' as const, text: 'body', order: 1 },
  ],
};

describe('Page Designer helpers (Stage 28)', () => {
  describe('validateSlug', () => {
    it('accepts valid slugs', () => {
      expect(validateSlug('hello')).toBe(true);
      expect(validateSlug('my-page-2')).toBe(true);
      expect(validateSlug('a-b-c-1-2')).toBe(true);
    });

    it('rejects invalid slugs', () => {
      expect(validateSlug('Hello')).toBe(false);
      expect(validateSlug('has space')).toBe(false);
      expect(validateSlug('UPPER')).toBe(false);
      expect(validateSlug('')).toBe(false);
    });
  });

  describe('validateBlock / validateBlocks', () => {
    it('returns null for a valid block', () => {
      expect(validateBlock({ id: 'x', type: 'view', viewId: 'v1', order: 0 })).toBeNull();
      expect(validateBlock({ id: 'x', type: 'heading', text: 'A', level: 1, order: 0 })).toBeNull();
      expect(validateBlock({ id: 'x', type: 'divider', order: 0 })).toBeNull();
    });

    it('rejects unknown types', () => {
      expect(validateBlock({ id: 'x', type: 'wut' as never, order: 0 })).toMatch(/unknown/);
    });

    it('rejects view without viewId', () => {
      expect(validateBlock({ id: 'x', type: 'view', order: 0 } as never)).toMatch(/viewId/);
    });

    it('rejects heading without level', () => {
      expect(validateBlock({ id: 'x', type: 'heading', text: 'A', order: 0 } as never)).toMatch(
        /level/
      );
    });

    it('rejects non-http webhook', () => {
      expect(
        validateBlock({
          id: 'x',
          type: 'button',
          label: 'X',
          webhookUrl: 'javascript:alert(1)',
          order: 0,
        })
      ).toMatch(/http/);
    });

    it('detects duplicate ids', () => {
      const err = validateBlocks([
        { id: 'a', type: 'divider', order: 0 },
        { id: 'a', type: 'divider', order: 1 },
      ]);
      expect(err).toMatch(/duplicate/);
    });

    it('validates a full input', () => {
      expect(validateCreateInput(baseInput)).toBeNull();
      expect(validateCreateInput({ ...baseInput, slug: 'BAD' })).toMatch(/slug/);
      expect(validateCreateInput({ ...baseInput, name: '' })).toMatch(/name/);
      expect(validateCreateInput({ ...baseInput, baseId: '' })).toMatch(/baseId/);
    });
  });

  describe('renumberBlocks', () => {
    it('sorts by order then reindexes', () => {
      const out = renumberBlocks([
        { id: 'a', type: 'divider', order: 5 },
        { id: 'b', type: 'divider', order: 1 },
        { id: 'c', type: 'divider', order: 3 },
      ]);
      expect(out.map((b) => b.order)).toEqual([0, 1, 2]);
      expect(out.map((b) => b.id)).toEqual(['b', 'c', 'a']);
    });
  });

  describe('buildPageRow / applyUpdate', () => {
    it('builds with defaults applied', () => {
      const row = buildPageRow({ ...baseInput, id: 'pg_1' });
      expect(row.visibility).toBe('authenticated');
      expect(row.blocks).toHaveLength(2);
      expect(row.blocks[0].order).toBe(0);
    });

    it('applyUpdate merges fields', () => {
      const row = buildPageRow({ ...baseInput, id: 'pg_1' });
      const updated = applyUpdate(row, { name: 'New' });
      expect(updated.name).toBe('New');
      expect(updated.slug).toBe(row.slug);
      expect(updated.updatedTime.getTime()).toBeGreaterThanOrEqual(row.updatedTime.getTime());
    });

    it('renumbers blocks on applyUpdate', () => {
      const row = buildPageRow({ ...baseInput, id: 'pg_1' });
      const updated = applyUpdate(row, {
        blocks: [
          { id: 'z', type: 'divider', order: 5 },
          { id: 'y', type: 'divider', order: 1 },
        ] as IPageBlock[],
      });
      expect(updated.blocks.map((b) => b.order)).toEqual([0, 1]);
    });
  });

  describe('resolveVisibility', () => {
    const page = (vis: IPageDefinition['visibility']): IPageDefinition => ({
      id: 'p',
      baseId: 'b',
      name: 'n',
      slug: 's',
      blocks: [],
      visibility: vis,
      theme: null,
      publishedAt: null,
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    });

    it('allows public pages to anyone', () => {
      expect(
        resolveVisibility({
          page: page('public'),
          caller: { authenticated: false, role: null, linkTokenValid: false },
        }).allowed
      ).toBe(true);
    });

    it('requires auth for authenticated pages', () => {
      expect(
        resolveVisibility({
          page: page('authenticated'),
          caller: { authenticated: false, role: null, linkTokenValid: false },
        }).reason
      ).toBe('not-authenticated');
      expect(
        resolveVisibility({
          page: page('authenticated'),
          caller: { authenticated: true, role: 'viewer', linkTokenValid: false },
        }).allowed
      ).toBe(true);
    });

    it('requires a valid link token for link pages', () => {
      expect(
        resolveVisibility({
          page: page('link'),
          caller: { authenticated: true, role: 'viewer', linkTokenValid: false },
        }).allowed
      ).toBe(false);
      expect(
        resolveVisibility({
          page: page('link'),
          caller: { authenticated: true, role: 'viewer', linkTokenValid: true },
        }).reason
      ).toBe('link-token');
    });

    it('enforces role hierarchy', () => {
      expect(
        resolveVisibility({
          page: page('role:owner'),
          caller: { authenticated: true, role: 'admin', linkTokenValid: false },
        }).reason
      ).toBe('role-mismatch');
      expect(
        resolveVisibility({
          page: page('role:editor'),
          caller: { authenticated: true, role: 'owner', linkTokenValid: false },
        }).reason
      ).toBe('role-match');
      expect(
        resolveVisibility({
          page: page('role:viewer'),
          caller: { authenticated: true, role: 'viewer', linkTokenValid: false },
        }).reason
      ).toBe('role-match');
    });

    it('returns page-not-found when null', () => {
      expect(
        resolveVisibility({
          page: null,
          caller: { authenticated: true, role: 'owner', linkTokenValid: false },
        }).reason
      ).toBe('page-not-found');
    });
  });

  describe('parseBlocks / stringifyBlocks / parseTheme', () => {
    it('round-trips blocks', () => {
      const blocks: IPageBlock[] = [
        { id: '1', type: 'heading', text: 'Hi', level: 1, order: 0 },
        { id: '2', type: 'divider', order: 1 },
      ];
      expect(parseBlocks(stringifyBlocks(blocks))).toEqual(blocks);
    });

    it('returns [] on bad JSON', () => {
      expect(parseBlocks('not json')).toEqual([]);
      expect(parseBlocks('"x"')).toEqual([]);
    });

    it('parses theme', () => {
      expect(parseTheme('{"primary":"#000"}')).toEqual({ primary: '#000' });
      expect(parseTheme(null)).toBeNull();
      expect(parseTheme('not json')).toBeNull();
      expect(parseTheme('[]')).toBeNull();
    });
  });

  describe('generatePageToken / hashPageToken / verifyToken / isTokenActive', () => {
    it('produces a pg_<48 hex> token', () => {
      const t = generatePageToken();
      expect(t).toMatch(/^pg_[a-f0-9]{48}$/);
    });

    it('hashes deterministically + verifies correctly', () => {
      const raw = generatePageToken();
      const stored = hashPageToken(raw);
      expect(stored).toMatch(/^[a-f0-9]{64}$/);
      expect(verifyToken(raw, stored)).toBe(true);
      expect(verifyToken('pg_xxx', stored)).toBe(false);
      expect(verifyToken(raw, 'short')).toBe(false);
    });

    it('isTokenActive respects revoke and expiry', () => {
      const now = new Date('2026-08-25T00:00:00Z');
      const base = (over: Partial<IPageToken>): IPageToken => ({
        id: 't',
        pageId: 'p',
        token: 'h',
        expiresAt: null,
        revokedAt: null,
        createdTime: now,
        ...over,
      });
      expect(isTokenActive({ token: base({}), now })).toBe(true);
      expect(
        isTokenActive({ token: base({ revokedAt: new Date('2026-08-20T00:00:00Z') }), now })
      ).toBe(false);
      expect(
        isTokenActive({ token: base({ expiresAt: new Date('2026-08-20T00:00:00Z') }), now })
      ).toBe(false);
      expect(isTokenActive({ token: null, now })).toBe(false);
    });
  });
});
