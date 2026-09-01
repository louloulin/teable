/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-AI-3e: Skills 3-layer scope types
 *
 * Mirrors Cloud (help.teable.ai/en/basic/admin-panel/skills.md):
 *   personal → base → space → instance
 * (narrower scope wins, instance is the default)
 */

export const PERSONAL_SKILL_KEY_PREFIX = 'personal_skills_v1:';
export const BASE_SKILL_KEY_PREFIX = 'base_skills_v1:';
export const SPACE_SKILL_KEY_PREFIX = 'space_skills_v1:';

export type SkillScope = 'personal' | 'base' | 'space';

export type ScopedSkill = {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  source: 'github' | 'upload';
  sourceUrl?: string;
  createdTime: string;
  lastModifiedTime: string;
  /** Scope identifier this skill was loaded from */
  scope: SkillScope;
  /** Owning entity for personal/base/space; undefined for instance */
  scopeId?: string;
};

export type SkillResolutionContext = {
  userId: string;
  baseId?: string;
  spaceId?: string;
};

/** Resolution result bucketed by scope so callers can decide priority. */
export type ResolvedSkills = {
  personal: ScopedSkill[];
  base: ScopedSkill[];
  space: ScopedSkill[];
  instance: ScopedSkill[];
};
