import {
  generateScimToken,
  groupToScim,
  hashScimToken,
  matchesFilter,
  parseBearerHeader,
  ScimService,
  scimToUserPatch,
  toListResponse,
  userToScim,
} from './scim.service';

describe('SCIM helpers (Stage 23)', () => {
  describe('tokens', () => {
    it('generates unique plaintext + matching hash + 4-char prefix', () => {
      const a = generateScimToken();
      const b = generateScimToken();
      expect(a.plaintext).not.toBe(b.plaintext);
      expect(a.plaintext.startsWith('scim_')).toBe(true);
      expect(a.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(a.prefix).toHaveLength(4);
      expect(hashScimToken(a.plaintext)).toBe(a.hash);
    });
  });

  describe('parseBearerHeader', () => {
    it('extracts the token from a Bearer header', () => {
      expect(parseBearerHeader('Bearer scim_abc')).toBe('scim_abc');
      expect(parseBearerHeader('bearer scim_xyz')).toBe('scim_xyz');
      expect(parseBearerHeader('  Bearer\t  scim_q ')).toBe('scim_q');
    });

    it('returns null when the header is malformed or missing', () => {
      expect(parseBearerHeader(null)).toBeNull();
      expect(parseBearerHeader(undefined)).toBeNull();
      expect(parseBearerHeader('')).toBeNull();
      expect(parseBearerHeader('Basic xxx')).toBeNull();
      expect(parseBearerHeader('Bearer')).toBeNull();
    });
  });

  describe('user <-> scim mapping', () => {
    it('userToScim maps Teable fields to a SCIM User payload', () => {
      const out = userToScim({
        id: 'u1',
        externalId: 'okta-1234',
        email: 'alice@example.com',
        name: 'Alice Park',
        active: true,
        role: 'admin',
      });
      expect(out.id).toBe('u1');
      expect(out.externalId).toBe('okta-1234');
      expect(out.userName).toBe('alice@example.com');
      expect(out.name?.givenName).toBe('Alice');
      expect(out.name?.familyName).toBe('Park');
      expect(out.active).toBe(true);
      expect(out.roles?.[0].value).toBe('admin');
    });

    it('scimToUserPatch extracts a primary email or falls back to userName', () => {
      const patch = scimToUserPatch({
        id: 'u1',
        externalId: 'okta-1234',
        userName: 'alice@example.com',
        name: { givenName: 'Alice', familyName: 'Park' },
        emails: [
          { value: 'secondary@example.com', type: 'home' },
          { value: 'alice@example.com', primary: true, type: 'work' },
        ],
        active: true,
      });
      expect(patch.email).toBe('alice@example.com');
      expect(patch.name).toBe('Alice Park');
      expect(patch.role).toBe('member');
    });

    it('scimToUserPatch uses formatted name when present', () => {
      expect(
        scimToUserPatch({
          id: 'u1',
          externalId: null,
          userName: 'x@y.com',
          name: { formatted: 'Mr. Alice Park' },
          active: true,
        }).name
      ).toBe('Mr. Alice Park');
    });
  });

  describe('groupToScim', () => {
    it('expands a member id list to SCIM member objects', () => {
      const out = groupToScim({
        id: 'g1',
        externalId: 'okta-g-1',
        displayName: 'Engineering',
        memberIds: ['u1', 'u2'],
      });
      expect(out.members).toHaveLength(2);
      expect(out.members[0]).toEqual({ value: 'u1' });
    });
  });

  describe('toListResponse', () => {
    it('wraps resources with the SCIM envelope', () => {
      const out = toListResponse({ resources: [{}, {}], startIndex: 1, itemsPerPage: 2 });
      expect(out.schemas).toEqual(['urn:ietf:params:scim:api:messages:2.0:ListResponse']);
      expect(out.totalResults).toBe(2);
      expect(out.itemsPerPage).toBe(2);
      expect(out.startIndex).toBe(1);
    });
  });

  describe('matchesFilter', () => {
    const users = [
      { userName: 'alice@example.com', externalId: 'okta-1', active: 'true', displayName: 'Alice' },
      { userName: 'bob@example.com', externalId: 'okta-2', active: 'true', displayName: 'Bob' },
      {
        userName: 'carol@example.com',
        externalId: 'azure-3',
        active: 'false',
        displayName: 'Carol',
      },
    ];

    it('returns true when no filter', () => {
      expect(matchesFilter(null, users[0])).toBe(true);
    });

    it('supports eq on userName', () => {
      expect(matchesFilter('userName eq "alice@example.com"', users[0])).toBe(true);
      expect(matchesFilter('userName eq "bob@example.com"', users[0])).toBe(false);
    });

    it('supports eq on active', () => {
      expect(matchesFilter('active eq "true"', users[0])).toBe(true);
      expect(matchesFilter('active eq "true"', users[2])).toBe(false);
    });

    it('supports co (contains) on displayName', () => {
      expect(matchesFilter('displayName co "ali"', users[0])).toBe(true);
      expect(matchesFilter('displayName co "bob"', users[1])).toBe(true);
    });

    it('supports and / or / not', () => {
      expect(matchesFilter('active eq "true" and userName eq "alice@example.com"', users[0])).toBe(
        true
      );
      expect(matchesFilter('active eq "true" and userName eq "carol@example.com"', users[2])).toBe(
        false
      );
      expect(
        matchesFilter('userName eq "alice@example.com" or userName eq "bob@example.com"', users[1])
      ).toBe(true);
      expect(matchesFilter('not active eq "true"', users[2])).toBe(true);
      expect(matchesFilter('not active eq "true"', users[0])).toBe(false);
    });
  });
});

describe('SCIM group persistence', () => {
  it('keeps groups visible to a new service instance', async () => {
    const rows = new Map<string, string>();
    const prisma = {
      setting: {
        findUnique: vi.fn(async ({ where }: { where: { name: string } }) => {
          const content = rows.get(where.name);
          return content === undefined ? null : { content };
        }),
        upsert: vi.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { name: string };
            create: { content: string };
            update: { content: string };
          }) => {
            rows.set(where.name, update.content ?? create.content);
          }
        ),
      },
    };

    const firstInstance = new ScimService(prisma as never);
    const created = await firstInstance.createGroup({
      displayName: 'Engineering',
      members: [{ value: 'usr_1' }],
    });
    const restartedInstance = new ScimService(prisma as never);

    await expect(restartedInstance.findGroupById(created.id)).resolves.toMatchObject({
      id: created.id,
      displayName: 'Engineering',
      members: [{ value: 'usr_1' }],
    });
  });
});
