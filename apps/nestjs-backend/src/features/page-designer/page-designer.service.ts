/**
 * Page Designer — Stage 28.
 *
 * Pure helpers for validating + resolving pages and blocks. No
 * Prisma here so the layout validation is testable without a DB.
 */

import { createHash, randomBytes } from 'node:crypto';

import type {
  ICreatePageInput,
  IPageBlock,
  IPageDefinition,
  IPageToken,
  IResolvedVisibility,
  IUpdatePageInput,
  PageBlockType,
  PageVisibility,
} from './page-designer.types';

export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const SUPPORTED_BLOCK_TYPES: ReadonlyArray<PageBlockType> = [
  'view',
  'heading',
  'text',
  'button',
  'filter',
  'divider',
  'image',
];

const HEX_64 = /^[a-f0-9]{64}$/;

export function generatePageToken(): string {
  return `pg_${randomBytes(24).toString('hex')}`;
}

export function hashPageToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Slug must be lowercase alphanumeric + dashes, 1-64 chars. */
export function validateSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

/** Validate a single block. Returns the error message or null. */
export function validateBlock(block: IPageBlock): string | null {
  if (!block || typeof block !== 'object') return 'block must be an object';
  if (!block.id || typeof block.id !== 'string') return 'block.id is required';
  if (!SUPPORTED_BLOCK_TYPES.includes(block.type)) return `unknown block type: ${block.type}`;
  if (typeof block.order !== 'number' || block.order < 0)
    return 'block.order must be a non-negative number';

  switch (block.type) {
    case 'view':
      if (!block.viewId) return 'view block requires viewId';
      break;
    case 'heading':
      if (!block.text || ![1, 2, 3].includes(block.level))
        return 'heading block requires text + level 1/2/3';
      break;
    case 'text':
      if (typeof block.text !== 'string') return 'text block requires text';
      break;
    case 'button':
      if (!block.label) return 'button block requires label';
      if (block.webhookUrl && !/^https?:\/\//.test(block.webhookUrl)) {
        return 'button webhookUrl must be http(s)';
      }
      break;
    case 'filter':
      if (!block.viewId) return 'filter block requires viewId';
      if (!Array.isArray(block.columns)) return 'filter block requires columns[]';
      break;
    case 'divider':
      break;
    case 'image':
      if (!block.url || !/^https?:\/\//.test(block.url)) return 'image block requires http(s) url';
      break;
  }
  return null;
}

/** Validate a blocks array: stable orders, unique ids, no duplicates. */
export function validateBlocks(blocks: IPageBlock[]): string | null {
  if (!Array.isArray(blocks)) return 'blocks must be an array';
  const seen = new Set<string>();
  for (const b of blocks) {
    const err = validateBlock(b);
    if (err) return err;
    if (seen.has(b.id)) return `duplicate block id: ${b.id}`;
    seen.add(b.id);
  }
  return null;
}

/** Validate a full create input. Returns the first error or null. */
export function validateCreateInput(input: ICreatePageInput): string | null {
  if (!input.baseId) return 'baseId is required';
  if (!input.name || input.name.length > 200) return 'name is required (≤200)';
  if (!validateSlug(input.slug)) return 'slug must match /^[a-z0-9-]+$/';
  if (!input.createdBy) return 'createdBy is required';
  const err = validateBlocks(input.blocks);
  if (err) return err;
  if (input.visibility && !SUPPORTED_VISIBILITY.includes(input.visibility))
    return 'unknown visibility';
  return null;
}

/** Re-number blocks by current sort to keep `order` stable. */
export function renumberBlocks(blocks: IPageBlock[]): IPageBlock[] {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  return sorted.map((b, i) => ({ ...b, order: i }));
}

export const SUPPORTED_VISIBILITY: ReadonlyArray<PageVisibility> = [
  'public',
  'link',
  'authenticated',
  'role:viewer',
  'role:editor',
  'role:admin',
  'role:owner',
];

/** Decide whether the caller can view the page. */
export function resolveVisibility(input: {
  page: IPageDefinition | null;
  caller: {
    authenticated: boolean;
    role: 'viewer' | 'editor' | 'admin' | 'owner' | null;
    linkTokenValid: boolean;
  };
}): IResolvedVisibility {
  if (!input.page) return { allowed: false, reason: 'page-not-found' };
  if (input.page.visibility === 'public') return { allowed: true, reason: 'public' };
  if (input.page.visibility === 'link') {
    return input.caller.linkTokenValid
      ? { allowed: true, reason: 'link-token' }
      : { allowed: false, reason: 'not-authenticated' };
  }
  if (input.page.visibility === 'authenticated') {
    return input.caller.authenticated
      ? { allowed: true, reason: 'authenticated' }
      : { allowed: false, reason: 'not-authenticated' };
  }
  // role:* gate
  const required = input.page.visibility.replace(/^role:/, '') as
    | 'viewer'
    | 'editor'
    | 'admin'
    | 'owner';
  const rank: Record<string, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };
  if (!input.caller.authenticated) return { allowed: false, reason: 'not-authenticated' };
  if (!input.caller.role || (rank[input.caller.role] ?? -1) < rank[required]) {
    return { allowed: false, reason: 'role-mismatch' };
  }
  return { allowed: true, reason: 'role-match' };
}

/** Parse a stored blocks_json string into the typed shape. */
export function parseBlocks(json: string): IPageBlock[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed as IPageBlock[];
  } catch {
    return [];
  }
}

/** Stringify blocks for storage. */
export function stringifyBlocks(blocks: IPageBlock[]): string {
  return JSON.stringify(blocks);
}

/** Parse themeJson. */
export function parseTheme(json: string | null): Record<string, string> | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // fallthrough
  }
  return null;
}

export function stringifyTheme(theme: Record<string, string> | null | undefined): string | null {
  if (!theme || Object.keys(theme).length === 0) return null;
  return JSON.stringify(theme);
}

/** Determine whether a stored token can be used right now. */
export function isTokenActive(input: { token: IPageToken | null; now?: Date }): boolean {
  if (!input.token) return false;
  if (input.token.revokedAt) return false;
  const now = input.now ?? new Date();
  if (input.token.expiresAt && input.token.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

export function verifyToken(presented: string, storedHash: string): boolean {
  if (!HEX_64.test(storedHash)) return false;
  const candidate = hashPageToken(presented);
  if (candidate.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

/** Build the next Page row from create input. */
export function buildPageRow(
  input: ICreatePageInput & { id: string; now?: Date }
): IPageDefinition {
  return {
    id: input.id,
    baseId: input.baseId,
    name: input.name,
    slug: input.slug,
    blocks: renumberBlocks(input.blocks),
    visibility: input.visibility ?? 'authenticated',
    theme: input.theme ?? null,
    publishedAt: null,
    createdBy: input.createdBy,
    createdTime: input.now ?? new Date(),
    updatedTime: input.now ?? new Date(),
  };
}

/** Apply a partial update on top of an existing row. */
export function applyUpdate(row: IPageDefinition, update: IUpdatePageInput): IPageDefinition {
  return {
    ...row,
    name: update.name ?? row.name,
    slug: update.slug ?? row.slug,
    blocks: update.blocks ? renumberBlocks(update.blocks) : row.blocks,
    visibility: update.visibility ?? row.visibility,
    theme: update.theme !== undefined ? update.theme : row.theme,
    updatedTime: new Date(),
  };
}
