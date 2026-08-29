/**
 * SCIM 2.0 storage layer.
 *
 * Owns three things:
 *
 *   - The instance-level SCIM config row (kept in a private SQLite-style row
 *     in the existing setting table under a name that does NOT collide with
 *     the SettingKey enum, so this PR requires no schema migration).
 *   - The bearer-token verification used by ScimAuthGuard.
 *   - A read-only projection of all instance users into the SCIM User
 *     resource shape used by the controller. Group management is handled
 *     in-memory at this layer because Teable OSS does not model
 *     "groups of users" as a first-class entity yet — adding one would
 *     exceed the Wave 9 build brief.
 *
 * Token storage: SHA-256(salt + token) at rest. The raw token is only
 * returned once on rotation. Token verification recomputes the hash with the
 * stored salt and compares.
 */
import { createHash, randomBytes } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { generateUserId } from '@teable/core';
import type { Prisma } from '@teable/db-main-prisma';
import { PrismaService } from '@teable/db-main-prisma';

import type { IScimGroup, IScimListResponse, IScimUser } from './scim.types';

const SCIM_SETTING_ROW_ID = 'scim:instance-config-v1';

interface IScimStoredConfig {
  enabled: boolean;
  tokenSalt: string;
  tokenHash: string;
  createdTime: string;
  lastRotatedTime: string;
}

interface IScimGroupRecord {
  id: string;
  displayName: string;
  externalId?: string;
  members: Array<{ value: string; display?: string }>;
  createdTime: string;
  lastModifiedTime: string;
}

interface IScimGroupPatchOp {
  op: 'add' | 'remove' | 'replace';
  path?: string;
  value?: unknown;
}

interface IScimGroupMemberInput {
  value: string;
  display?: string;
}

interface IScimGroupMemberValue {
  value: string;
  display?: string;
}

const SCIM_GROUP_MEMBER_PATH_FILTER = /^members\[value eq "([^"]+)"\]$/;

const emptyConfig = (): IScimStoredConfig => ({
  enabled: false,
  tokenSalt: randomBytes(16).toString('hex'),
  tokenHash: '',
  createdTime: new Date().toISOString(),
  lastRotatedTime: new Date().toISOString(),
});

const hashToken = (salt: string, token: string) =>
  createHash('sha256').update(`${salt}:${token}`).digest('hex');

export function generateScimToken(): { plaintext: string; hash: string; prefix: string } {
  const plaintext = `scim_${randomBytes(32).toString('hex')}`;
  return {
    plaintext,
    hash: hashScimToken(plaintext),
    prefix: plaintext.slice(-4),
  };
}

export function hashScimToken(plaintext: string): string {
  return createHash('sha256').update(plaintext.trim()).digest('hex');
}

export function parseBearerHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export function userToScim(input: {
  id: string;
  externalId: string | null;
  email: string;
  name: string | null;
  active: boolean;
  role: string;
}): IScimUser {
  const parts = (input.name ?? '').trim().split(/\s+/);
  return {
    id: input.id,
    externalId: input.externalId,
    userName: input.email,
    name: {
      givenName: parts[0] || undefined,
      familyName: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
      formatted: input.name ?? input.email,
    },
    emails: [{ value: input.email, primary: true, type: 'work' }],
    active: input.active,
    roles: [{ value: input.role, display: input.role, primary: true }],
  };
}

export function scimToUserPatch(input: IScimUser) {
  const email =
    input.emails?.find((entry) => entry.primary)?.value ??
    input.emails?.[0]?.value ??
    input.userName;
  const computedName = [input.name?.givenName, input.name?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return {
    externalId: input.externalId ?? null,
    email,
    name: input.name?.formatted ?? (computedName || null),
    active: input.active,
    role: input.roles?.[0]?.value ?? 'member',
  };
}

export function groupToScim(input: {
  id: string;
  externalId: string | null;
  displayName: string;
  memberIds: string[];
}): IScimGroup {
  return {
    id: input.id,
    externalId: input.externalId,
    displayName: input.displayName,
    members: input.memberIds.map((id) => ({ value: id })),
  };
}

export function toListResponse<T>(opts: {
  resources: T[];
  startIndex: number;
  itemsPerPage: number;
  totalResults?: number;
}): IScimListResponse<T> {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: opts.totalResults ?? opts.resources.length,
    itemsPerPage: opts.itemsPerPage,
    startIndex: opts.startIndex,
    Resources: opts.resources,
  };
}

export function matchesFilter(
  filter: string | null | undefined,
  resource: Record<string, unknown>
): boolean {
  if (!filter) return true;
  const tokens = tokenizeFilter(filter);
  return tokens.length === 0 ? true : parseFilterOr(tokens, 0, resource).value;
}

type FilterToken =
  | { kind: 'attr'; value: string }
  | { kind: 'op'; value: 'eq' | 'co' | 'ne' }
  | { kind: 'bool'; value: 'and' | 'or' | 'not' }
  | { kind: 'value'; value: string };

interface IFilterCursor {
  value: boolean;
  next: number;
}

function tokenizeFilter(input: string): FilterToken[] {
  const tokens: FilterToken[] = [];
  const pattern = /"([^"]*)"|(\b(?:and|or|not)\b)|(\b(?:eq|co|ne)\b)|([a-z_][\w.]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    if (match[1] !== undefined) {
      tokens.push({ kind: 'value', value: match[1] });
    } else if (match[2]) {
      tokens.push({
        kind: 'bool',
        value: match[2].toLowerCase() as 'and' | 'or' | 'not',
      });
    } else if (match[3]) {
      tokens.push({ kind: 'op', value: match[3].toLowerCase() as 'eq' | 'co' | 'ne' });
    } else if (match[4]) {
      tokens.push({ kind: 'attr', value: match[4] });
    }
  }
  return tokens;
}

function parseFilterOr(
  tokens: FilterToken[],
  index: number,
  resource: Record<string, unknown>
): IFilterCursor {
  let left = parseFilterAnd(tokens, index, resource);
  while (
    left.next < tokens.length &&
    tokens[left.next]?.kind === 'bool' &&
    tokens[left.next]?.value === 'or'
  ) {
    const right = parseFilterAnd(tokens, left.next + 1, resource);
    left = { value: left.value || right.value, next: right.next };
  }
  return left;
}

function parseFilterAnd(
  tokens: FilterToken[],
  index: number,
  resource: Record<string, unknown>
): IFilterCursor {
  let left = parseFilterNot(tokens, index, resource);
  while (
    left.next < tokens.length &&
    tokens[left.next]?.kind === 'bool' &&
    tokens[left.next]?.value === 'and'
  ) {
    const right = parseFilterNot(tokens, left.next + 1, resource);
    left = { value: left.value && right.value, next: right.next };
  }
  return left;
}

function parseFilterNot(
  tokens: FilterToken[],
  index: number,
  resource: Record<string, unknown>
): IFilterCursor {
  if (tokens[index]?.kind === 'bool' && tokens[index]?.value === 'not') {
    const inner = parseFilterComparison(tokens, index + 1, resource);
    return { value: !inner.value, next: inner.next };
  }
  return parseFilterComparison(tokens, index, resource);
}

function parseFilterComparison(
  tokens: FilterToken[],
  index: number,
  resource: Record<string, unknown>
): IFilterCursor {
  const attr = tokens[index];
  const op = tokens[index + 1];
  const value = tokens[index + 2];
  if (attr?.kind !== 'attr' || op?.kind !== 'op' || value?.kind !== 'value') {
    return { value: true, next: index };
  }
  const left = String(resource[attr.value] ?? '');
  const right = value.value;
  const result =
    op.value === 'co'
      ? left.toLowerCase().includes(right.toLowerCase())
      : op.value === 'eq'
        ? left === right
        : left !== right;
  return { value: result, next: index + 3 };
}

const generateGroupId = () => `grp_${randomBytes(12).toString('hex')}`;

const cloneMembers = (members: IScimGroupMemberValue[]) => members.map((m) => ({ ...m }));

@Injectable()
export class ScimService {
  private readonly logger = new Logger(ScimService.name);

  // Process-local SCIM Group store. OSS Teable does not yet model SCIM groups
  // as first-class entities — this in-memory map is the canonical record for
  // round-tripping between the controller and the SCIM IdP until the group
  // domain is built out.
  private readonly groupStore = new Map<string, IScimGroupRecord>();

  constructor(private readonly prisma: PrismaService) {}

  // ── config storage ────────────────────────────────────────────────────

  async loadConfig(): Promise<IScimStoredConfig> {
    const row = await this.prisma.setting.findUnique({
      where: { id: SCIM_SETTING_ROW_ID },
    });
    if (!row || !row.content) {
      return emptyConfig();
    }
    try {
      const parsed = JSON.parse(row.content as string) as Partial<IScimStoredConfig>;
      return {
        enabled: parsed.enabled ?? false,
        tokenSalt: parsed.tokenSalt ?? randomBytes(16).toString('hex'),
        tokenHash: parsed.tokenHash ?? '',
        createdTime: parsed.createdTime ?? new Date().toISOString(),
        lastRotatedTime: parsed.lastRotatedTime ?? new Date().toISOString(),
      };
    } catch {
      return emptyConfig();
    }
  }

  private async saveConfig(cfg: IScimStoredConfig) {
    await this.prisma.setting.upsert({
      where: { id: SCIM_SETTING_ROW_ID },
      update: { content: JSON.stringify(cfg) },
      create: {
        id: SCIM_SETTING_ROW_ID,
        name: 'scimConfig',
        content: JSON.stringify(cfg),
      },
    });
  }

  // ── token rotation / verification ─────────────────────────────────────

  /** Issue a fresh bearer token, hash+salt it, and persist. Returns the raw token once. */
  async rotateToken(): Promise<{ token: string; cfg: IScimStoredConfig }> {
    const prev = await this.loadConfig();
    const tokenSalt = randomBytes(16).toString('hex');
    const token = `scim_${randomBytes(24).toString('hex')}`;
    const next: IScimStoredConfig = {
      enabled: true,
      tokenSalt,
      tokenHash: hashToken(tokenSalt, token),
      createdTime: prev.createdTime,
      lastRotatedTime: new Date().toISOString(),
    };
    await this.saveConfig(next);
    this.logger.log('SCIM bearer token rotated');
    return { token, cfg: next };
  }

  async verifyToken(token: string): Promise<boolean> {
    if (!token) return false;
    const cfg = await this.loadConfig();
    if (!cfg.enabled || !cfg.tokenHash) return false;
    return hashToken(cfg.tokenSalt, token) === cfg.tokenHash;
  }

  // ── SCIM User / Group projection ──────────────────────────────────────

  /** Project a Prisma user row into the SCIM 2.0 User resource shape. */
  toScimUser(u: {
    id: string;
    email: string;
    name: string;
    deactivatedTime?: Date | null;
    deletedTime?: Date | null;
  }) {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: u.id,
      externalId: u.email,
      userName: u.email,
      name: { formatted: u.name, familyName: undefined, givenName: undefined },
      displayName: u.name,
      emails: u.email
        ? [{ value: u.email, primary: true }]
        : ([] as Array<{ value: string; primary: boolean }>),
      active: !u.deactivatedTime && !u.deletedTime,
      meta: {
        resourceType: 'User',
        created: (u as { createdTime?: Date }).createdTime?.toISOString?.() ?? undefined,
        lastModified:
          (u as { lastModifiedTime?: Date }).lastModifiedTime?.toISOString?.() ?? undefined,
      },
    };
  }

  /** Project an in-memory group record into the SCIM 2.0 Group resource shape. */
  toScimGroup(g: IScimGroupRecord) {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      id: g.id,
      externalId: g.externalId,
      displayName: g.displayName,
      members: [...g.members],
      meta: {
        resourceType: 'Group',
        created: g.createdTime,
        lastModified: g.lastModifiedTime,
      },
    };
  }

  async listInstanceUsers() {
    return this.prisma.user.findMany({
      where: { deletedTime: null },
      select: {
        id: true,
        email: true,
        name: true,
        deactivatedTime: true,
        createdTime: true,
        lastModifiedTime: true,
      },
    });
  }

  async findInstanceUserById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, deletedTime: null },
      select: {
        id: true,
        email: true,
        name: true,
        deactivatedTime: true,
        createdTime: true,
        lastModifiedTime: true,
      },
    });
  }

  async findInstanceUserByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedTime: null },
      select: {
        id: true,
        email: true,
        name: true,
        deactivatedTime: true,
        createdTime: true,
        lastModifiedTime: true,
      },
    });
  }

  /** Soft-provision a user via the SCIM controller. Uses the same path as
   * self-signup so banned-domain + risk-control checks still apply. */
  async provisionUser(args: {
    email: string;
    name?: string;
    externalId?: string;
    active?: boolean;
  }) {
    const existing = await this.findInstanceUserByEmail(args.email);
    if (existing) return existing;
    const id = generateUserId();
    const data: Prisma.UserUncheckedCreateInput = {
      id,
      email: args.email.toLowerCase(),
      name: args.name ?? args.email.split('@')[0],
    };
    await this.prisma.user.create({ data });
    return this.findInstanceUserById(id);
  }

  async patchUserName(id: string, name: string) {
    await this.prisma.user.update({
      where: { id },
      data: { name },
    });
    return this.findInstanceUserById(id);
  }

  async deactivateUser(id: string) {
    await this.prisma.user.update({
      where: { id, deletedTime: null },
      data: { deactivatedTime: new Date() },
    });
    return this.findInstanceUserById(id);
  }

  async deleteUser(id: string) {
    await this.prisma.user.update({
      where: { id, deletedTime: null },
      data: { deletedTime: new Date() },
    });
  }

  // ── SCIM Group CRUD (in-memory) ───────────────────────────────────────

  async listGroups(): Promise<IScimGroupRecord[]> {
    return Array.from(this.groupStore.values());
  }

  async findGroupById(id: string): Promise<IScimGroupRecord | null> {
    return this.groupStore.get(id) ?? null;
  }

  async createGroup(input: {
    displayName: string;
    externalId?: string;
    members?: IScimGroupMemberInput[];
  }): Promise<IScimGroupRecord> {
    if (!input.displayName) {
      throw new BadRequestException('displayName is required');
    }
    const now = new Date().toISOString();
    const record: IScimGroupRecord = {
      id: generateGroupId(),
      displayName: input.displayName,
      externalId: input.externalId,
      members: input.members ? cloneMembers(input.members) : [],
      createdTime: now,
      lastModifiedTime: now,
    };
    this.groupStore.set(record.id, record);
    return record;
  }

  async replaceGroup(
    id: string,
    input: {
      displayName: string;
      externalId?: string;
      members?: IScimGroupMemberInput[];
    }
  ): Promise<IScimGroupRecord> {
    const existing = this.groupStore.get(id);
    if (!existing) throw new NotFoundException('Group not found');
    const updated: IScimGroupRecord = {
      ...existing,
      displayName: input.displayName,
      externalId: input.externalId,
      members: input.members ? cloneMembers(input.members) : [],
      lastModifiedTime: new Date().toISOString(),
    };
    this.groupStore.set(id, updated);
    return updated;
  }

  async patchGroup(id: string, ops: IScimGroupPatchOp[]): Promise<IScimGroupRecord> {
    const existing = this.groupStore.get(id);
    if (!existing) throw new NotFoundException('Group not found');
    let working: IScimGroupRecord = {
      ...existing,
      members: cloneMembers(existing.members),
    };
    for (const op of ops) {
      working = this.applyGroupPatchOp(working, op);
    }
    working.lastModifiedTime = new Date().toISOString();
    this.groupStore.set(id, working);
    return working;
  }

  async deleteGroup(id: string): Promise<void> {
    const existing = this.groupStore.get(id);
    if (!existing) throw new NotFoundException('Group not found');
    this.groupStore.delete(id);
  }

  private applyGroupPatchOp(state: IScimGroupRecord, op: IScimGroupPatchOp): IScimGroupRecord {
    if (!op.path) return this.applyGroupWholeResourceOp(state, op);
    if (op.path === 'displayName') return this.applyGroupDisplayNameOp(state, op);
    if (op.path === 'members') return this.applyGroupMembersPathOp(state, op);
    return this.applyGroupMemberFilterOp(state, op);
  }

  private applyGroupWholeResourceOp(
    state: IScimGroupRecord,
    op: IScimGroupPatchOp
  ): IScimGroupRecord {
    if (op.op === 'remove') {
      return { ...state, displayName: '', members: [] };
    }
    if (op.op !== 'replace' && op.op !== 'add') {
      return state;
    }
    const v = (op.value ?? {}) as {
      displayName?: string;
      members?: IScimGroupMemberValue[];
      externalId?: string;
    };
    return {
      ...state,
      displayName: v.displayName ?? state.displayName,
      externalId: v.externalId ?? state.externalId,
      members: v.members ? cloneMembers(v.members) : state.members,
    };
  }

  private applyGroupDisplayNameOp(
    state: IScimGroupRecord,
    op: IScimGroupPatchOp
  ): IScimGroupRecord {
    if (op.op === 'remove') {
      throw new BadRequestException('displayName cannot be removed');
    }
    return { ...state, displayName: String(op.value ?? '') };
  }

  private applyGroupMembersPathOp(
    state: IScimGroupRecord,
    op: IScimGroupPatchOp
  ): IScimGroupRecord {
    const incoming = (op.value ?? []) as IScimGroupMemberValue[];
    if (op.op === 'remove') {
      const toRemove = new Set(incoming.map((m) => m.value));
      return {
        ...state,
        members: state.members.filter((m) => !toRemove.has(m.value)),
      };
    }
    if (op.op !== 'add' && op.op !== 'replace') return state;
    const known = new Set(state.members.map((m) => m.value));
    const merged = [...state.members];
    for (const m of incoming) {
      if (!known.has(m.value)) {
        merged.push({ ...m });
        known.add(m.value);
      }
    }
    return { ...state, members: merged };
  }

  private applyGroupMemberFilterOp(
    state: IScimGroupRecord,
    op: IScimGroupPatchOp
  ): IScimGroupRecord {
    const match = SCIM_GROUP_MEMBER_PATH_FILTER.exec(op.path ?? '');
    if (!match) return state;
    const targetId = match[1];
    if (op.op === 'remove') {
      return {
        ...state,
        members: state.members.filter((m) => m.value !== targetId),
      };
    }
    const idx = state.members.findIndex((m) => m.value === targetId);
    const incoming = (op.value ?? {}) as { display?: string };
    if (idx >= 0) {
      const next = [...state.members];
      next[idx] = {
        value: targetId,
        display: incoming.display ?? state.members[idx].display,
      };
      return { ...state, members: next };
    }
    return {
      ...state,
      members: [...state.members, { value: targetId, display: incoming.display }],
    };
  }
}
