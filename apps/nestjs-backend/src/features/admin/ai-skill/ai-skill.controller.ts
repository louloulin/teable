import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';
import type { Response } from 'express';
import { getAiSkillFile, listAiSkillFiles } from './ai-skill.content';

/**
 * Round-25: AI Skill content server.
 *
 * Serves the inline skill files (SKILL.md, AUTH.md, API.md, EXAMPLES.md) so
 * AI agents can install the full Teable skill directly from the OSS instance
 * without cloning the external github.com/teableio/agent-skills repo.
 *
 * Files are embedded as TS constants (see ai-skill.content.ts) so they survive
 * webpack bundling — reading from `__dirname` would miss the .md source files
 * because the dist/ tree only contains the compiled bundle.
 *
 * Endpoints (all public, no auth):
 *   GET /api/admin/enterprise-readiness/ai-skill/files
 *     → { total, files: [{name, size, bytes}] }
 *   GET /api/admin/enterprise-readiness/ai-skill/files/:name
 *     → raw markdown text (text/markdown; charset=utf-8)
 */
@Controller('api/admin/enterprise-readiness/ai-skill')
export class AiSkillController {
  @Public()
  @Get('files')
  files(): unknown {
    const all = listAiSkillFiles();
    return {
      total: all.length,
      files: all,
    };
  }

  @Public()
  @Get('files/:name')
  file(@Param('name') name: string, @Res() res: Response): void {
    // Defensive: only allow .md file names — no path separators, traversal, etc.
    if (!name || name.includes('/') || name.includes('..') || !name.endsWith('.md')) {
      throw new NotFoundException(`invalid file name: ${name}`);
    }
    const entry = getAiSkillFile(name);
    if (!entry) {
      throw new NotFoundException(`file not found: ${name}`);
    }
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(entry.content);
  }
}
