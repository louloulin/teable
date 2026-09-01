/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-AI-3e: Skill scope service — Personal / Base / Space storage + resolution.
 *
 * Storage layout (zero new migrations):
 *   Setting table is keyed by `personal_skills_v1:${userId}`,
 *   `base_skills_v1:${baseId}`, `space_skills_v1:${spaceId}`. Each row
 *   stores a JSON `{ skills: ScopedSkill[] }` document, mirroring the
 *   existing instance-skills/instance-skill.service.ts pattern.
 *
 * Instance skills are owned by InstanceSkillService (separate module)
 * and surfaced via `resolve()` for completeness.
 */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { randomUUID } from 'node:crypto';
import type {
  ResolvedSkills,
  ScopedSkill,
  SkillResolutionContext,
  SkillScope,
} from './skill-scope.types';
import {
  BASE_SKILL_KEY_PREFIX,
  PERSONAL_SKILL_KEY_PREFIX,
  SPACE_SKILL_KEY_PREFIX,
} from './skill-scope.types';

const MAX_SKILL_BYTES = 512 * 1024;
const MAX_SKILLS = 100;

type SkillInput = {
  name: string;
  description?: string;
  content: string;
  enabled?: boolean;
  source?: 'github' | 'upload';
  sourceUrl?: string;
};

const validateInput = (input: SkillInput): SkillInput => {
  if (!input.name || typeof input.name !== 'string') {
    throw new BadRequestException('name is required');
  }
  if (input.name.length > 120) {
    throw new BadRequestException('name must be 120 chars or less');
  }
  if (typeof input.content !== 'string' || input.content.length === 0) {
    throw new BadRequestException('content is required');
  }
  if (Buffer.byteLength(input.content, 'utf8') > MAX_SKILL_BYTES) {
    throw new BadRequestException(`content exceeds ${MAX_SKILL_BYTES} bytes`);
  }
  return {
    ...input,
    name: input.name.trim().slice(0, 120),
    description: (input.description ?? '').slice(0, 500),
    enabled: input.enabled !== false,
    source: input.source === 'github' ? 'github' : 'upload',
    sourceUrl: input.sourceUrl?.slice(0, 2000),
  };
};

@Injectable()
export class SkillScopeService {
  constructor(private readonly prismaService: PrismaService) {}

  // ─── Personal scope ──────────────────────────────────────────────
  async listPersonal(userId: string): Promise<ScopedSkill[]> {
    return this.loadFromKey(PERSONAL_SKILL_KEY_PREFIX + userId, 'personal', userId);
  }

  async addPersonal(userId: string, input: SkillInput): Promise<ScopedSkill> {
    const skills = await this.listPersonal(userId);
    const validated = validateInput(input);
    if (skills.some((s) => s.name === validated.name)) {
      throw new BadRequestException(`personal skill "${validated.name}" already exists`);
    }
    if (skills.length >= MAX_SKILLS) {
      throw new BadRequestException(`personal skill cap (${MAX_SKILLS}) reached`);
    }
    const now = new Date().toISOString();
    const skill: ScopedSkill = {
      id: randomUUID(),
      scope: 'personal',
      scopeId: userId,
      name: validated.name,
      description: validated.description ?? '',
      content: validated.content,
      enabled: validated.enabled !== false,
      source: validated.source ?? 'upload',
      sourceUrl: validated.sourceUrl,
      createdTime: now,
      lastModifiedTime: now,
    };
    await this.saveToKey(PERSONAL_SKILL_KEY_PREFIX + userId, [...skills, skill]);
    return skill;
  }

  async deletePersonal(userId: string, id: string): Promise<void> {
    await this.deleteOneFromKey(PERSONAL_SKILL_KEY_PREFIX + userId, id, 'personal');
  }

  // ─── Base scope (collab-gated) ───────────────────────────────────
  async listBase(userId: string, baseId: string): Promise<ScopedSkill[]> {
    await this.assertBaseAccess(userId, baseId);
    return this.loadFromKey(BASE_SKILL_KEY_PREFIX + baseId, 'base', baseId);
  }

  async addBase(userId: string, baseId: string, input: SkillInput): Promise<ScopedSkill> {
    const { canEdit } = await this.assertBaseAccess(userId, baseId);
    if (!canEdit) throw new ForbiddenException('base editor role required to add base skills');
    return this.addScopedKey(BASE_SKILL_KEY_PREFIX + baseId, 'base', baseId, input);
  }

  async deleteBase(userId: string, baseId: string, id: string): Promise<void> {
    const { canEdit } = await this.assertBaseAccess(userId, baseId);
    if (!canEdit) throw new ForbiddenException('base editor role required');
    await this.deleteOneFromKey(BASE_SKILL_KEY_PREFIX + baseId, id, 'base');
  }

  // ─── Space scope (space-admin-gated) ─────────────────────────────
  async listSpace(userId: string, spaceId: string): Promise<ScopedSkill[]> {
    await this.assertSpaceAdmin(userId, spaceId);
    return this.loadFromKey(SPACE_SKILL_KEY_PREFIX + spaceId, 'space', spaceId);
  }

  async addSpace(userId: string, spaceId: string, input: SkillInput): Promise<ScopedSkill> {
    await this.assertSpaceAdmin(userId, spaceId);
    return this.addScopedKey(SPACE_SKILL_KEY_PREFIX + spaceId, 'space', spaceId, input);
  }

  async deleteSpace(userId: string, spaceId: string, id: string): Promise<void> {
    await this.assertSpaceAdmin(userId, spaceId);
    await this.deleteOneFromKey(SPACE_SKILL_KEY_PREFIX + spaceId, id, 'space');
  }

  // ─── Resolution (priority: personal > base > space > instance) ─
  async resolve(ctx: SkillResolutionContext): Promise<ResolvedSkills> {
    const personal = await this.listPersonal(ctx.userId);
    const base =
      ctx.baseId !== undefined ? await this.loadFromKey(BASE_SKILL_KEY_PREFIX + ctx.baseId, 'base', ctx.baseId) : [];
    const space =
      ctx.spaceId !== undefined
        ? await this.loadFromKey(SPACE_SKILL_KEY_PREFIX + ctx.spaceId, 'space', ctx.spaceId)
        : [];
    // Instance skills are owned by InstanceSkillService. We keep the surface
    // here for the ResolvedSkills shape but don't fetch to avoid circular dep.
    // Caller resolves instance separately via InstanceSkillService.list().
    return {
      personal: personal.filter((s) => s.enabled),
      base: base.filter((s) => s.enabled),
      space: space.filter((s) => s.enabled),
      instance: [],
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────
  private async loadFromKey(
    key: string,
    scope: SkillScope,
    scopeId: string
  ): Promise<ScopedSkill[]> {
    const row = await this.prismaService.setting.findUnique({
      where: { name: key },
      select: { content: true },
    });
    if (!row?.content) return [];
    try {
      const parsed = JSON.parse(row.content) as { skills?: unknown };
      if (!Array.isArray(parsed.skills)) return [];
      return parsed.skills
        .filter((s): s is Omit<ScopedSkill, 'scope' | 'scopeId'> => {
          if (!s || typeof s !== 'object') return false;
          const v = s as Partial<ScopedSkill>;
          return typeof v.id === 'string' && typeof v.name === 'string' && typeof v.content === 'string';
        })
        .map((s) => ({ ...s, scope, scopeId }));
    } catch {
      return [];
    }
  }

  private async saveToKey(key: string, skills: ScopedSkill[]): Promise<void> {
    const content = JSON.stringify({ skills });
    const now = new Date();
    await this.prismaService.setting.upsert({
      where: { name: key },
      create: { name: key, content, createdBy: 'system', createdTime: now },
      update: { content, lastModifiedTime: now, lastModifiedBy: 'system' },
    });
  }

  private async addScopedKey(
    key: string,
    scope: SkillScope,
    scopeId: string,
    rawInput: SkillInput
  ): Promise<ScopedSkill> {
    const skills = await this.loadFromKey(key, scope, scopeId);
    const validated = validateInput(rawInput);
    if (skills.some((s) => s.name === validated.name)) {
      throw new BadRequestException(`${scope} skill "${validated.name}" already exists`);
    }
    if (skills.length >= MAX_SKILLS) {
      throw new BadRequestException(`${scope} skill cap (${MAX_SKILLS}) reached`);
    }
    const now = new Date().toISOString();
    const skill: ScopedSkill = {
      id: randomUUID(),
      scope,
      scopeId,
      name: validated.name,
      description: validated.description ?? '',
      content: validated.content,
      enabled: validated.enabled !== false,
      source: validated.source ?? 'upload',
      sourceUrl: validated.sourceUrl,
      createdTime: now,
      lastModifiedTime: now,
    };
    await this.saveToKey(key, [...skills, skill]);
    return skill;
  }

  private async deleteOneFromKey(key: string, id: string, scope: SkillScope): Promise<void> {
    const skills = await this.loadFromKey(key, scope, key.slice(key.indexOf(':') + 1));
    const next = skills.filter((s) => s.id !== id);
    if (next.length === skills.length) throw new NotFoundException(`${scope} skill ${id} not found`);
    if (next.length === 0) {
      await this.prismaService.setting.deleteMany({ where: { name: key } });
    } else {
      await this.saveToKey(key, next);
    }
  }

  private async assertBaseAccess(userId: string, baseId: string): Promise<{ canEdit: boolean }> {
    // Collaborator schema: principalId + principalType='user'. roleName is
    // the role string (e.g. 'owner', 'editor', 'viewer'). Soft-delete handled
    // upstream by joining the active space/base record.
    const collabs = await this.prismaService.collaborator.findMany({
      where: {
        resourceId: baseId,
        resourceType: 'base',
        principalId: userId,
        principalType: 'user',
      },
      select: { roleName: true },
    });
    if (collabs.length === 0) throw new ForbiddenException('no base access');
    const roleNames = collabs.map((c) => c.roleName.toLowerCase());
    const canEdit = roleNames.some((r) => r === 'owner' || r === 'editor' || r === 'admin');
    return { canEdit };
  }

  private async assertSpaceAdmin(userId: string, spaceId: string): Promise<void> {
    const collabs = await this.prismaService.collaborator.findMany({
      where: {
        resourceId: spaceId,
        resourceType: 'space',
        principalId: userId,
        principalType: 'user',
      },
      select: { roleName: true },
    });
    if (collabs.length === 0) throw new ForbiddenException('no space access');
    const roleNames = collabs.map((c) => c.roleName.toLowerCase());
    if (!roleNames.some((r) => r === 'owner' || r === 'admin')) {
      throw new ForbiddenException('space admin role required');
    }
  }
}
