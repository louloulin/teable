import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { ClsService } from 'nestjs-cls';
import unzipper from 'unzipper';
import type { IClsStore } from '../../types/cls';
import { safeFetch } from '../../utils/ssrf-http';
import { AuditScope } from '../audit/audit-scope';

const MAX_SKILL_BYTES = 512 * 1024;
const MAX_SKILLS = 100;
const SKILL_SETTING_NAME = 'instanceSkills';

export type InstanceSkill = {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  source: 'github' | 'upload';
  sourceUrl?: string;
  createdTime: string;
  lastModifiedTime: string;
};

type SkillStore = { skills: InstanceSkill[] };

const parseStore = (content: string | null): SkillStore => {
  if (!content) return { skills: [] };
  try {
    const parsed = JSON.parse(content) as { skills?: unknown };
    if (!Array.isArray(parsed.skills)) return { skills: [] };
    return {
      skills: parsed.skills.filter((skill): skill is InstanceSkill => {
        if (!skill || typeof skill !== 'object') return false;
        const value = skill as Partial<InstanceSkill>;
        return (
          typeof value.id === 'string' &&
          typeof value.name === 'string' &&
          typeof value.content === 'string' &&
          typeof value.enabled === 'boolean'
        );
      }),
    };
  } catch {
    return { skills: [] };
  }
};

const frontmatterValue = (content: string, key: string): string | undefined => {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return undefined;
  for (const line of lines.slice(1)) {
    if (line.trim() === '---') break;
    const separator = line.indexOf(':');
    if (separator <= 0 || line.slice(0, separator).trim() !== key) continue;
    return line
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
  }
  return undefined;
};

const descriptionFromSkill = (content: string, fallback: string): string => {
  return frontmatterValue(content, 'description') || fallback;
};

const nameFromSkill = (content: string, fallback: string): string => {
  return (frontmatterValue(content, 'name') || fallback).slice(0, 120);
};

const validateContent = (content: string) => {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes === 0 || bytes > MAX_SKILL_BYTES) {
    throw new BadRequestException(`SKILL.md must be between 1 and ${MAX_SKILL_BYTES} bytes`);
  }
  if (content.trim().length === 0) {
    throw new BadRequestException('SKILL.md is empty');
  }
};

@Injectable()
export class InstanceSkillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<IClsStore>,
    private readonly audit: AuditScope
  ) {}

  async list(includeContent = false) {
    const store = await this.readStore();
    return store.skills.map((skill) => (includeContent ? skill : this.publicSkill(skill)));
  }

  async get(id: string) {
    const skill = (await this.readStore()).skills.find((item) => item.id === id);
    if (!skill) throw new NotFoundException('Instance skill not found');
    return skill;
  }

  async importFile(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('A .zip or .skill file is required');
    let content: string;
    try {
      const buffer = file.buffer ?? (file.path ? await readFile(file.path) : undefined);
      if (!buffer) throw new BadRequestException('Uploaded file is empty');
      content = await this.readSkillFile(buffer);
    } finally {
      if (file.path) await unlink(file.path).catch(() => undefined);
    }
    return this.upsertSkill(content, 'upload');
  }

  async importGithub(sourceUrl: string) {
    const rawUrl = this.toGithubRawUrl(sourceUrl);
    const response = await safeFetch(rawUrl);
    if (!response.ok) throw new BadRequestException(`GitHub returned HTTP ${response.status}`);
    const content = await response.text();
    validateContent(content);
    return this.upsertSkill(content, 'github', sourceUrl);
  }

  async update(
    id: string,
    input: { name?: string; description?: string; content?: string; enabled?: boolean }
  ) {
    const store = await this.readStore();
    const index = store.skills.findIndex((skill) => skill.id === id);
    if (index < 0) throw new NotFoundException('Instance skill not found');
    const current = store.skills[index];
    if (input.content !== undefined) validateContent(input.content);
    const next = {
      ...current,
      ...input,
      name: input.name?.trim() || current.name,
      description: input.description?.trim() ?? current.description,
      lastModifiedTime: new Date().toISOString(),
    };
    store.skills[index] = next;
    await this.writeStore(store);
    await this.audit.emitAtomic({
      action: 'admin.instance_skill.update',
      resourceId: id,
      payload: { enabled: next.enabled },
    });
    return next;
  }

  async remove(id: string) {
    const store = await this.readStore();
    const next = store.skills.filter((skill) => skill.id !== id);
    if (next.length === store.skills.length)
      throw new NotFoundException('Instance skill not found');
    await this.writeStore({ skills: next });
    await this.audit.emitAtomic({
      action: 'admin.instance_skill.delete',
      resourceId: id,
      payload: {},
    });
    return { id, deleted: true } as const;
  }

  async refresh(id: string) {
    const skill = await this.get(id);
    if (skill.source !== 'github' || !skill.sourceUrl) {
      throw new BadRequestException('Only GitHub skills can be refreshed');
    }
    const rawUrl = this.toGithubRawUrl(skill.sourceUrl);
    const response = await safeFetch(rawUrl);
    if (!response.ok) throw new BadRequestException(`GitHub returned HTTP ${response.status}`);
    const content = await response.text();
    validateContent(content);
    return this.update(id, {
      content,
      name: nameFromSkill(content, skill.name),
      description: descriptionFromSkill(content, skill.description),
    });
  }

  async enabledPromptContext() {
    const skills = await this.list(true);
    const enabled = skills.filter((skill): skill is InstanceSkill => skill.enabled);
    if (enabled.length === 0) return '';
    return [
      'Instance-published skills. Follow these instructions when relevant:',
      ...enabled.map((skill) => `\n## ${skill.name}\n${skill.content}`),
    ].join('\n');
  }

  private async readSkillFile(buffer: Buffer): Promise<string> {
    if (buffer.byteLength > MAX_SKILL_BYTES * 4) {
      throw new BadRequestException('Skill archive is too large');
    }
    const archive = await unzipper.Open.buffer(buffer);
    const entry = archive.files.find((file) => {
      const normalized = file.path.replaceAll('\\', '/');
      return (
        (file.type === 'File' && normalized.toLowerCase().endsWith('/skill.md')) ||
        normalized.toLowerCase() === 'skill.md'
      );
    });
    if (!entry) throw new BadRequestException('Archive must contain SKILL.md');
    const content = (await entry.buffer()).toString('utf8');
    validateContent(content);
    return content;
  }

  private toGithubRawUrl(sourceUrl: string) {
    let url: URL;
    try {
      url = new URL(sourceUrl);
    } catch {
      throw new BadRequestException('Invalid GitHub URL');
    }
    if (url.protocol !== 'https:') throw new BadRequestException('GitHub URL must use HTTPS');
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname === 'raw.githubusercontent.com' && parts.length >= 4) {
      return url.toString();
    }
    if (
      url.hostname !== 'github.com' ||
      parts.length < 5 ||
      (parts[2] !== 'tree' && parts[2] !== 'blob')
    ) {
      throw new BadRequestException('Use a GitHub tree/blob URL or raw.githubusercontent.com URL');
    }
    const owner = parts[0];
    const repo = parts[1];
    const ref = parts[3];
    const path = parts.slice(4);
    const filePath = parts[2] === 'blob' ? path.join('/') : `${path.join('/')}/SKILL.md`;
    if (!owner || !repo || !ref || !filePath || filePath.includes('..'))
      throw new BadRequestException('Invalid GitHub skill path');
    return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
  }

  private async upsertSkill(content: string, source: InstanceSkill['source'], sourceUrl?: string) {
    validateContent(content);
    const now = new Date().toISOString();
    const name = nameFromSkill(content, 'Imported skill');
    const description = descriptionFromSkill(content, 'Instance-published skill');
    const store = await this.readStore();
    const existing = store.skills.find((skill) => skill.name === name);
    const skill: InstanceSkill = {
      id: existing?.id ?? randomUUID(),
      name,
      description,
      content,
      enabled: existing?.enabled ?? true,
      source,
      ...(sourceUrl ? { sourceUrl } : {}),
      createdTime: existing?.createdTime ?? now,
      lastModifiedTime: now,
    };
    const nextSkills = existing
      ? store.skills.map((item) => (item.id === existing.id ? skill : item))
      : [skill, ...store.skills];
    if (nextSkills.length > MAX_SKILLS)
      throw new BadRequestException(`Only ${MAX_SKILLS} instance skills are supported`);
    await this.writeStore({ skills: nextSkills });
    await this.audit.emitAtomic({
      action: 'admin.instance_skill.import',
      resourceId: skill.id,
      payload: { source, name },
    });
    return skill;
  }

  private publicSkill(skill: InstanceSkill) {
    const { content: _content, ...publicValue } = skill;
    return publicValue;
  }

  private async readStore(): Promise<SkillStore> {
    const row = await this.prisma.setting.findUnique({
      where: { name: SKILL_SETTING_NAME },
      select: { content: true },
    });
    return parseStore(row?.content ?? null);
  }

  private async writeStore(store: SkillStore) {
    const userId = this.cls.get('user.id') ?? 'system';
    await this.prisma.txClient().setting.upsert({
      where: { name: SKILL_SETTING_NAME },
      update: { content: JSON.stringify(store), lastModifiedBy: userId },
      create: { name: SKILL_SETTING_NAME, content: JSON.stringify(store), createdBy: userId },
    });
  }
}
