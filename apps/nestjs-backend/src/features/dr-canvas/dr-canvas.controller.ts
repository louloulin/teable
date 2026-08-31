import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';

import { DrCanvasAuthService } from './dr-canvas.auth.service';
import type {
  DrCanvasSpec,
  DrExecutionPlan,
  DrValidationResult,
} from './dr-canvas.types';

/**
 * Round-33: DR canvas HTTP controller.
 *
 * Exposes DrCanvasAuthService over HTTP — both the in-memory graph
 * helpers (validate / topoSort / plan / addNode / addEdge / etc.) and
 * the new persistence methods (upsertCanvas / loadCanvas / listCanvases /
 * deleteCanvas). Without this controller, the dr_canvas capability is
 * unreachable — same "service exists, no surface" gap that R28-R32 fixed.
 *
 * Routes (all under /api/dr-canvas):
 *   PUT  /canvases/:id                       upsert canvas (persisted)
 *   GET  /canvases/:id                       load canvas spec
 *   GET  /bases/:baseId/canvases             list canvases (metadata only)
 *   DELETE /canvases/:id                     delete canvas
 *   POST /canvases/:id/validate              validate a canvas spec
 *   POST /canvases/:id/plan                  generate execution plan
 */
@Public()
@Controller('api/dr-canvas')
export class DrCanvasController {
  constructor(private readonly auth: DrCanvasAuthService) {}

  // ---- Persisted canvas CRUD ----

  @Put('canvases/:id')
  @HttpCode(200)
  async upsertCanvas(
    @Param('id') id: string,
    @Body()
    body: {
      baseId: string;
      name: string;
      canvas: DrCanvasSpec;
      sourceRegion: string;
      destRegion: string;
      createdBy: string;
    }
  ): Promise<DrCanvasSpec> {
    if (
      !body?.baseId ||
      !body?.name ||
      !body?.canvas ||
      !body?.sourceRegion ||
      !body?.destRegion ||
      !body?.createdBy
    ) {
      throw new BadRequestException(
        'baseId, name, canvas, sourceRegion, destRegion, createdBy required'
      );
    }
    return this.auth.upsertCanvas({
      id,
      baseId: body.baseId,
      name: body.name,
      canvas: body.canvas,
      sourceRegion: body.sourceRegion,
      destRegion: body.destRegion,
      createdBy: body.createdBy,
    });
  }

  @Get('canvases/:id')
  async loadCanvas(
    @Param('id') id: string
  ): Promise<DrCanvasSpec | { canvas: null }> {
    const c = await this.auth.loadCanvas(id);
    return c ?? { canvas: null };
  }

  @Get('bases/:baseId/canvases')
  async listCanvases(
    @Param('baseId') baseId: string
  ): Promise<{
    canvases: Array<{
      id: string;
      name: string;
      sourceRegion: string;
      destRegion: string;
      updatedAt: string | null;
    }>;
  }> {
    return { canvases: await this.auth.listCanvases(baseId) };
  }

  @Delete('canvases/:id')
  @HttpCode(200)
  async deleteCanvas(@Param('id') id: string): Promise<{ deleted: boolean }> {
    await this.auth.deleteCanvas(id);
    return { deleted: true };
  }

  // ---- Pure helpers (no persistence) ----

  @Post('canvases/:id/validate')
  @HttpCode(200)
  async validateCanvas(
    @Body() body: {
      canvas: DrCanvasSpec;
      catalog?: Record<string, readonly string[]>;
    }
  ): Promise<DrValidationResult> {
    if (!body?.canvas) {
      throw new BadRequestException('canvas required');
    }
    return this.auth.validate(body.canvas, body.catalog);
  }

  @Post('canvases/:id/plan')
  @HttpCode(200)
  async planCanvas(
    @Body() body: { canvas: DrCanvasSpec }
  ): Promise<DrExecutionPlan> {
    if (!body?.canvas) {
      throw new BadRequestException('canvas required');
    }
    return this.auth.plan(body.canvas);
  }
}
