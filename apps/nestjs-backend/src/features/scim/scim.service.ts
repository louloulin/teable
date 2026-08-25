/**
 * SCIM 2.0 helpers — Stage 23.
 *
 * Pure helpers used by the SCIM controller + service:
 *   - token generation + hashing
 *   - SCIM <-> Teable user mapping
 *   - filter expression parsing (the subset Okta / Azure AD emit)
 *
 * Filter subset (RFC 7644 §3.4.2.2):
 *   userName eq "alice@example.com"
 *   externalId eq "okta-1234"
 *   active eq true
 *   displayName co "Engineering"
 *   AND / OR / NOT
 *
 * We deliberately do NOT support parentheses nesting or value-greater-than
 * — every IdP we care about emits a flat AND of `eq` / `co` filters.
 */

import { createHash, randomBytes } from 'crypto';

import type { IScimGroup, IScimListResponse, IScimUser } from './scim.types';

const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const SCIM_GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group';
const SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const SCIM_ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';

/** Generate a 32-byte SCIM bearer token; return the plaintext + a one-way hash. */
export function generateScimToken(): { plaintext: string; hash: string; prefix: string } {
  const buf = randomBytes(32);
  const plaintext = `scim_${buf.toString('hex')}`;
  const hash = createHash('sha256').update(plaintext).digest('hex');
  const prefix = plaintext.slice(-4);
  return { plaintext, hash, prefix };
}

/** Constant-time hash for verifying an incoming bearer token. */
export function hashScimToken(plaintext: string): string {
  return createHash('sha256').update(plaintext.trim()).digest('hex');
}

/** Parse the `Authorization: Bearer <token>` header. Returns null when malformed. */
export function parseBearerHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m ? m[1] : null;
}

/** Teable user row -> SCIM User payload. */
export function userToScim(input: {
  id: string;
  externalId: string | null;
  email: string;
  name: string | null;
  active: boolean;
  role: string;
}): IScimUser {
  const parts = (input.name ?? '').trim().split(/\s+/);
  const givenName = parts[0] ?? undefined;
  const familyName = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
  return {
    id: input.id,
    externalId: input.externalId,
    userName: input.email,
    name: {
      givenName,
      familyName,
      formatted: input.name ?? input.email,
    },
    emails: [{ value: input.email, primary: true, type: 'work' }],
    active: input.active,
    roles: [{ value: input.role, display: input.role, primary: true }],
  };
}

/** SCIM User payload -> patch row for the Teable user table. */
export function scimToUserPatch(input: IScimUser): {
  externalId: string | null;
  email: string;
  name: string | null;
  active: boolean;
  role: string;
} {
  const email =
    input.emails?.find((e) => e.primary)?.value ?? input.emails?.[0]?.value ?? input.userName;
  const computed =
    [input.name?.givenName, input.name?.familyName].filter(Boolean).join(' ').trim() || null;
  const formatted = input.name?.formatted ?? computed;
  return {
    externalId: input.externalId ?? null,
    email,
    name: formatted,
    active: input.active,
    role: input.roles?.[0]?.value ?? 'member',
  };
}

/** Group membership list -> SCIM Group payload. */
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

/** Wrap a page of resources in the SCIM ListResponse envelope. */
export function toListResponse<T>(opts: {
  resources: T[];
  startIndex: number;
  itemsPerPage: number;
  totalResults?: number;
}): IScimListResponse<T> {
  return {
    schemas: [SCIM_LIST_SCHEMA],
    totalResults: opts.totalResults ?? opts.resources.length,
    itemsPerPage: opts.itemsPerPage,
    startIndex: opts.startIndex,
    Resources: opts.resources,
  };
}

/** SCIM error envelope (RFC 7644 §3.7.3). */
export function scimError(
  status: number,
  detail: string,
  scimType?: string
): {
  status: number;
  body: { schemas: string[]; detail: string; status: string; scimType?: string };
} {
  return {
    status,
    body: {
      schemas: [SCIM_ERROR_SCHEMA],
      detail,
      status: String(status),
      ...(scimType ? { scimType } : {}),
    },
  };
}

/** Schema URIs we advertise in the ServiceProviderConfig endpoint. */
export const SCIM_SCHEMAS = {
  user: SCIM_USER_SCHEMA,
  group: SCIM_GROUP_SCHEMA,
  list: SCIM_LIST_SCHEMA,
  error: SCIM_ERROR_SCHEMA,
};

/**
 * Evaluate a SCIM filter expression against a single resource.
 * Returns true if the resource matches. Supports a flat `eq`/`co`
 * over `userName` / `externalId` / `active` / `displayName`,
 * joined by `and` / `or`. NOT is also supported.
 *
 * Examples:
 *   userName eq "alice@example.com"
 *   active eq "true" and externalId eq "okta-1234"
 *   displayName co "Engineering"
 */
export function matchesFilter(
  filter: string | null | undefined,
  resource: Record<string, unknown>
): boolean {
  if (!filter) return true;
  const tokens = tokenize(filter);
  if (tokens.length === 0) return true;
  return evaluate(tokens, resource);
}

type Token =
  | { kind: 'attr'; value: string }
  | { kind: 'op'; value: 'eq' | 'co' | 'ne' }
  | { kind: 'bool'; value: 'and' | 'or' | 'not' }
  | { kind: 'value'; value: string };

function tokenize(input: string): Token[] {
  const out: Token[] = [];
  const re = /"([^"]*)"|(\band\b|\bor\b|\bnot\b)|(\beq\b|\bco\b|\bne\b)|([A-Za-z_][\w.]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    if (m[1] !== undefined) {
      out.push({ kind: 'value', value: m[1] });
    } else if (m[2]) {
      out.push({ kind: 'bool', value: m[2].toLowerCase() as 'and' | 'or' | 'not' });
    } else if (m[3]) {
      out.push({ kind: 'op', value: m[3].toLowerCase() as 'eq' | 'co' | 'ne' });
    } else if (m[4]) {
      out.push({ kind: 'attr', value: m[4] });
    }
  }
  return out;
}

function evaluate(tokens: Token[], resource: Record<string, unknown>): boolean {
  // Pratt-ish precedence: not > and > or (matches RFC 7644).
  return parseOr(tokens, 0, resource).value;
}

interface Cursor {
  value: boolean;
  next: number;
}

function parseOr(tokens: Token[], i: number, res: Record<string, unknown>): Cursor {
  let left = parseAnd(tokens, i, res);
  while (left.next < tokens.length) {
    const t = tokens[left.next];
    if (t.kind === 'bool' && t.value === 'or') {
      const right = parseAnd(tokens, left.next + 1, res);
      left = { value: left.value || right.value, next: right.next };
    } else {
      break;
    }
  }
  return left;
}

function parseAnd(tokens: Token[], i: number, res: Record<string, unknown>): Cursor {
  let left = parseNot(tokens, i, res);
  while (left.next < tokens.length) {
    const t = tokens[left.next];
    if (t.kind === 'bool' && t.value === 'and') {
      const right = parseNot(tokens, left.next + 1, res);
      left = { value: left.value && right.value, next: right.next };
    } else {
      break;
    }
  }
  return left;
}

function parseNot(tokens: Token[], i: number, res: Record<string, unknown>): Cursor {
  const t = tokens[i];
  if (t?.kind === 'bool' && t.value === 'not') {
    const inner = parseComparison(tokens, i + 1, res);
    return { value: !inner.value, next: inner.next };
  }
  return parseComparison(tokens, i, res);
}

function parseComparison(tokens: Token[], i: number, res: Record<string, unknown>): Cursor {
  const attr = tokens[i];
  const op = tokens[i + 1];
  const val = tokens[i + 2];
  if (attr?.kind !== 'attr' || op?.kind !== 'op' || val?.kind !== 'value') {
    return { value: true, next: i }; // permissive: malformed filter matches nothing
  }
  const left = String(res[attr.value] ?? '');
  const right = val.value;
  let pass: boolean;
  switch (op.value) {
    case 'eq':
      pass =
        left === right ||
        (right === 'true' && left === 'true') ||
        (right === 'false' && left === 'false');
      break;
    case 'ne':
      pass = left !== right;
      break;
    case 'co':
      pass = left.toLowerCase().includes(right.toLowerCase());
      break;
  }
  return { value: pass, next: i + 3 };
}
