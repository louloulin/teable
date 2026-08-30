import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { InstanceSkillService } from './instance-skill.service';

const idSchema = z.object({ id: z.string().uuid() });
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const importUrlSchema = z.object({ sourceUrl: z.string().url().max(2000) });
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  content: z
    .string()
    .min(1)
    .max(512 * 1024)
    .optional(),
  enabled: z.boolean().optional(),
});

@Controller('api/admin/skills')
@Permissions('instance|update')
export class InstanceSkillController {
  constructor(private readonly skills: InstanceSkillService) {}

  @Get()
  @Permissions('instance|read')
  list() {
    return this.skills.list();
  }

  @Get(':id')
  @Permissions('instance|read')
  get(@Param(new ZodValidationPipe(idSchema)) params: { id: string }) {
    return this.skills.get(params.id);
  }

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_request, file, callback) => {
        const valid = file.originalname.endsWith('.zip') || file.originalname.endsWith('.skill');
        callback(
          valid ? null : new BadRequestException('Only .zip or .skill files are supported'),
          valid
        );
      },
    })
  )
  import(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(importUrlSchema.partial())) input: { sourceUrl?: string }
  ) {
    if (file) return this.skills.importFile(file);
    if (input.sourceUrl) return this.skills.importGithub(input.sourceUrl);
    throw new BadRequestException('Provide a GitHub sourceUrl or upload a .zip/.skill file');
  }

  @Patch(':id')
  update(
    @Param(new ZodValidationPipe(idSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateSchema)) input: z.infer<typeof updateSchema>
  ) {
    return this.skills.update(params.id, input);
  }

  @Post(':id/refresh')
  refresh(@Param(new ZodValidationPipe(idSchema)) params: { id: string }) {
    return this.skills.refresh(params.id);
  }

  @Get(':id/download')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  async download(
    @Param(new ZodValidationPipe(idSchema)) params: { id: string },
    @Res({ passthrough: true }) response: Response
  ) {
    const skill = await this.skills.get(params.id);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${skill.name.replace(/[^\w.-]/g, '_')}.md"`
    );
    return skill.content;
  }

  @Delete(':id')
  remove(@Param(new ZodValidationPipe(idSchema)) params: { id: string }) {
    return this.skills.remove(params.id);
  }
}
