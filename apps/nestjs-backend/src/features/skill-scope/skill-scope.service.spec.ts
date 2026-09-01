/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-AI-3e: Skill scope service — Personal / Base / Space priority chain
 *
 * Storage layout mirror: each test pre-seeds the Setting table with a
 * JSON-encoded `{ skills: ScopedSkill[] }` document keyed by the
 * corresponding v1 prefix. assertBaseAccess / assertSpaceAdmin are
 * stubbed at the Collaborator-level so the tests stay offline.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillScopeService } from './skill-scope.service';
import type { ScopedSkill } from './skill-scope.types';

const mockSetting = new Map<string, string>();
const mockCollaborator: Array<{ resourceType: string; resourceId: string; userId: string; role: string }> = [];

const prismaStub = {
  setting: {
    findUnique: vi.fn(async ({ where }: { where: { name: string } }) => {
      const content = mockSetting.get(where.name) ?? null;
      return content ? { content } : null;
    }),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const existing = mockSetting.get(where.name);
      const final = existing ? update.content ?? create.content : create.content;
      mockSetting.set(where.name, final);
      return { name: where.name, content: final };
    }),
    deleteMany: vi.fn(async ({ where }: any) => {
      mockSetting.delete(where.name);
      return { count: 1 };
    }),
  },
  collaborator: {
    findMany: vi.fn(async ({ where }: any) =>
      mockCollaborator.filter((c) => {
        if (c.resourceType !== where.resourceType) return false;
        if (c.resourceId !== where.resourceId) return false;
        if (c.principalId !== where.principalId) return false;
        if (where.principalType && c.principalType !== where.principalType) return false;
        return true;
      }).map((c) => ({ roleName: c.role }))
    ),
  },
};

const buildService = () =>
  new SkillScopeService(prismaStub as unknown as ConstructorParameters<typeof SkillScopeService>[0]);

const seedSkills = (key: string, skills: ScopedSkill[]) => {
  mockSetting.set(key, JSON.stringify({ skills }));
};

const clearAll = () => {
  mockSetting.clear();
  mockCollaborator.length = 0;
};

beforeEach(() => {
  clearAll();
  vi.clearAllMocks();
});

// ─── Personal ────────────────────────────────────────────────
describe('R-AI-3e Personal scope', () => {
  it('listPersonal returns empty for unseen user', async () => {
    const svc = buildService();
    expect(await svc.listPersonal('userA')).toEqual([]);
  });

  it('addPersonal then listPersonal round-trips', async () => {
    const svc = buildService();
    const created = await svc.addPersonal('userA', {
      name: 'house-style',
      description: 'use concise bullets',
      content: '# house-style\nUse concise bullets.',
      enabled: true,
      source: 'upload',
    });
    expect(created.scope).toBe('personal');
    expect(created.scopeId).toBe('userA');
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    const list = await svc.listPersonal('userA');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('house-style');
  });

  it('addPersonal rejects duplicate name in same user scope', async () => {
    const svc = buildService();
    await svc.addPersonal('userA', { name: 'dup', content: 'x' });
    await expect(svc.addPersonal('userA', { name: 'dup', content: 'y' })).rejects.toThrow(/already exists/);
  });

  it('personal skills are isolated per user', async () => {
    const svc = buildService();
    await svc.addPersonal('userA', { name: 's1', content: 'A' });
    await svc.addPersonal('userB', { name: 's1', content: 'B' });
    expect((await svc.listPersonal('userA'))[0].content).toBe('A');
    expect((await svc.listPersonal('userB'))[0].content).toBe('B');
  });

  it('deletePersonal removes the skill', async () => {
    const svc = buildService();
    const c = await svc.addPersonal('userA', { name: 'rm', content: 'x' });
    await svc.deletePersonal('userA', c.id);
    expect(await svc.listPersonal('userA')).toEqual([]);
  });
});

// ─── Base ───────────────────────────────────────────────────
describe('R-AI-3e Base scope', () => {
  beforeEach(() => {
    mockCollaborator.push({ resourceType: 'base', resourceId: 'b1', principalId: 'userA', principalType: 'user', role: 'editor' });
    mockCollaborator.push({ resourceType: 'base', resourceId: 'b2', principalId: 'userA', principalType: 'user', role: 'viewer' });
  });

  it('listBase allows any collab role (read)', async () => {
    const svc = buildService();
    // seed a base skill directly (bypass addBase editor gate)
    seedSkills('base_skills_v1:b2', [
      {
        id: 'sx', scope: 'base', scopeId: 'b2', name: 'pre', description: '',
        content: 'seeded', enabled: true, source: 'upload', createdTime: '', lastModifiedTime: '',
      },
    ]);
    // viewer user (b2) can read but cannot add
    expect(await svc.listBase('userA', 'b2')).toHaveLength(1);
    await expect(svc.addBase('userA', 'b2', { name: 'new', content: 'x' })).rejects.toThrow(/editor/);
  });

  it('addBase rejects viewer role', async () => {
    const svc = buildService();
    await expect(svc.addBase('userA', 'b2', { name: 's', content: 'x' })).rejects.toThrow(/editor/);
  });

  it('addBase accepts editor/owner/admin', async () => {
    const svc = buildService();
    const skill = await svc.addBase('userA', 'b1', { name: 's', content: 'x' });
    expect(skill.scope).toBe('base');
    expect(skill.scopeId).toBe('b1');
  });

  it('addBase rejects when user has no collab row', async () => {
    const svc = buildService();
    await expect(svc.addBase('userA', 'b3', { name: 's', content: 'x' })).rejects.toThrow(/no base access/);
  });

  it('deleteBase allows editor', async () => {
    const svc = buildService();
    const c = await svc.addBase('userA', 'b1', { name: 's', content: 'x' });
    await svc.deleteBase('userA', 'b1', c.id);
    expect(await svc.listBase('userA', 'b1')).toEqual([]);
  });

  it('different bases keep separate lists', async () => {
    const svc = buildService();
    mockCollaborator.push({ resourceType: 'base', resourceId: 'b3', principalId: 'userA', principalType: 'user', role: 'editor' });
    await svc.addBase('userA', 'b1', { name: 'x', content: 'A' });
    await svc.addBase('userA', 'b3', { name: 'x', content: 'B' });
    expect((await svc.listBase('userA', 'b1'))[0].content).toBe('A');
    expect((await svc.listBase('userA', 'b3'))[0].content).toBe('B');
  });
});

// ─── Space ──────────────────────────────────────────────────
describe('R-AI-3e Space scope', () => {
  it('addSpace rejects viewer role', async () => {
    mockCollaborator.push({ resourceType: 'space', resourceId: 'sp1', principalId: 'userA', principalType: 'user', role: 'editor' });
    const svc = buildService();
    await expect(svc.addSpace('userA', 'sp1', { name: 's', content: 'x' })).rejects.toThrow(/space admin/);
  });

  it('addSpace accepts owner/admin', async () => {
    mockCollaborator.push({ resourceType: 'space', resourceId: 'sp1', principalId: 'userA', principalType: 'user', role: 'owner' });
    const svc = buildService();
    const skill = await svc.addSpace('userA', 'sp1', { name: 's', content: 'x' });
    expect(skill.scope).toBe('space');
    expect(skill.scopeId).toBe('sp1');
  });
});

// ─── Resolution (priority chain) ───────────────────────────
describe('R-AI-3e resolve() priority chain', () => {
  it('disabled skills are filtered out at each scope', async () => {
    const svc = buildService();
    await svc.addPersonal('userA', { name: 'on', content: 'on', enabled: true });
    await svc.addPersonal('userA', { name: 'off', content: 'off', enabled: false });
    const resolved = await svc.resolve({ userId: 'userA' });
    expect(resolved.personal.map((s) => s.name)).toEqual(['on']);
  });

  it('resolve returns empty arrays for scopes not in context', async () => {
    const svc = buildService();
    const r = await svc.resolve({ userId: 'userA' });
    expect(r.personal).toEqual([]);
    expect(r.base).toEqual([]);
    expect(r.space).toEqual([]);
    expect(r.instance).toEqual([]);
  });

  it('resolve fetches base + space when context provides ids', async () => {
    mockCollaborator.push({ resourceType: 'base', resourceId: 'b1', userId: 'userA', role: 'viewer' });
    mockCollaborator.push({ resourceType: 'space', resourceId: 'sp1', userId: 'userA', role: 'admin' });
    const svc = buildService();
    seedSkills('personal_skills_v1:userA', [
      {
        id: 'p1', scope: 'personal', scopeId: 'userA', name: 'p', description: '',
        content: 'c', enabled: true, source: 'upload', createdTime: '', lastModifiedTime: '',
      },
    ]);
    seedSkills('base_skills_v1:b1', [
      {
        id: 'b1s', scope: 'base', scopeId: 'b1', name: 'b', description: '',
        content: 'c', enabled: true, source: 'upload', createdTime: '', lastModifiedTime: '',
      },
    ]);
    seedSkills('space_skills_v1:sp1', [
      {
        id: 's1', scope: 'space', scopeId: 'sp1', name: 's', description: '',
        content: 'c', enabled: true, source: 'upload', createdTime: '', lastModifiedTime: '',
      },
    ]);
    const r = await svc.resolve({ userId: 'userA', baseId: 'b1', spaceId: 'sp1' });
    expect(r.personal.map((x) => x.id)).toEqual(['p1']);
    expect(r.base.map((x) => x.id)).toEqual(['b1s']);
    expect(r.space.map((x) => x.id)).toEqual(['s1']);
  });
});
