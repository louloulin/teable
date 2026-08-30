import { PassThrough } from 'node:stream';

import { BadRequestException, NotFoundException } from '@nestjs/common';
import archiver from 'archiver';
import { describe, expect, it, vi } from 'vitest';
import { safeFetch } from '../../utils/ssrf-http';
import { InstanceSkillService } from './instance-skill.service';

vi.mock('../../utils/ssrf-http', () => ({ safeFetch: vi.fn() }));

const skillContent = `---\nname: Incident response\ndescription: Handle incidents\n---\n\nFollow the runbook.`;

const buildPrisma = (content: string | null = null) => {
  let storedContent = content;
  const setting = {
    findUnique: vi
      .fn()
      .mockImplementation(async () => (storedContent === null ? null : { content: storedContent })),
    upsert: vi.fn().mockImplementation(async ({ data, update }) => {
      storedContent = data?.content ?? update.content;
      return { content: storedContent };
    }),
  };
  const txSetting = { upsert: setting.upsert };
  return {
    setting,
    txClient: vi.fn(() => ({ setting: txSetting })),
  };
};

const buildService = (content: string | null = null) => {
  const prisma = buildPrisma(content);
  const cls = { get: vi.fn().mockReturnValue('admin-1') };
  const audit = { emitAtomic: vi.fn().mockResolvedValue(undefined) };
  const service = new InstanceSkillService(prisma as never, cls as never, audit as never);
  return { service, prisma, cls, audit };
};

const zipSkill = async (content: string, path = 'skills/incident/SKILL.md') => {
  const archive = archiver('zip');
  const chunks: Buffer[] = [];
  const output = new PassThrough();
  output.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    output.on('end', () => resolve(Buffer.concat(chunks)));
    output.on('error', reject);
  });
  archive.pipe(output);
  archive.append(content, { name: path });
  await archive.finalize();
  return done;
};

describe('InstanceSkillService', () => {
  it('lists an empty setting and hides content from the public list', async () => {
    const { service } = buildService();
    await expect(service.list()).resolves.toEqual([]);

    const stored = JSON.stringify({
      skills: [
        { id: 'skill-1', name: 'A', description: 'B', content: skillContent, enabled: true },
      ],
    });
    const { service: populated } = buildService(stored);
    await expect(populated.list()).resolves.toEqual([
      { id: 'skill-1', name: 'A', description: 'B', enabled: true },
    ]);
  });

  it('imports SKILL.md from an archive and persists JSON', async () => {
    const { service, prisma, audit } = buildService();
    const buffer = await zipSkill(skillContent);
    const result = await service.importFile({ buffer } as Express.Multer.File);

    expect(result.name).toBe('Incident response');
    expect(result.source).toBe('upload');
    expect(prisma.txClient).toHaveBeenCalledOnce();
    expect(audit.emitAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.instance_skill.import', resourceId: result.id })
    );
    const persisted = prisma.txClient().setting.upsert.mock.calls[0][0].update.content;
    expect(JSON.parse(persisted).skills[0].content).toBe(skillContent);
  });

  it('rejects archives without SKILL.md', async () => {
    const { service } = buildService();
    const buffer = await zipSkill('not a skill', 'README.md');
    await expect(service.importFile({ buffer } as Express.Multer.File)).rejects.toThrow(
      BadRequestException
    );
  });

  it('accepts only HTTPS GitHub URLs and refreshes source content', async () => {
    const { service } = buildService();
    await expect(
      service.importGithub('http://github.com/acme/repo/blob/main/SKILL.md')
    ).rejects.toThrow(/HTTPS/);
    await expect(
      service.importGithub('https://example.com/acme/repo/blob/main/SKILL.md')
    ).rejects.toThrow(/GitHub/);

    const stored = JSON.stringify({
      skills: [
        {
          id: 'skill-1',
          name: 'Old',
          description: 'Old',
          content: skillContent,
          enabled: true,
          source: 'github',
          sourceUrl: 'https://github.com/acme/repo/blob/main/SKILL.md',
          createdTime: '2026-01-01T00:00:00.000Z',
          lastModifiedTime: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const { service: refreshable } = buildService(stored);
    vi.mocked(safeFetch).mockResolvedValueOnce(
      new Response(`---\nname: Refreshed\ndescription: New\n---\n\nUpdated.`)
    );
    const refreshed = await refreshable.refresh('skill-1');
    expect(refreshed.name).toBe('Refreshed');
    expect(safeFetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/acme/repo/main/SKILL.md'
    );
    await expect(refreshable.refresh('missing')).rejects.toThrow(NotFoundException);
  });

  it('updates enabled state and includes only enabled skills in prompt context', async () => {
    const stored = JSON.stringify({
      skills: [
        { id: 'on', name: 'On', description: '', content: 'Use on', enabled: true },
        { id: 'off', name: 'Off', description: '', content: 'Ignore off', enabled: false },
      ],
    });
    const { service, audit } = buildService(stored);
    await service.update('on', { enabled: false });
    await expect(service.enabledPromptContext()).resolves.toBe('');
    await service.update('off', { enabled: true });
    await expect(service.enabledPromptContext()).resolves.toContain('Ignore off');
    expect(audit.emitAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.instance_skill.update' })
    );
    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
  });
});
