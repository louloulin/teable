/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-AI-3e: Skills 3-layer scope HTTP surface
 *
 * Endpoints (all under `/api/cuppy/skills`):
 *   GET  /personal          → list user's personal skills
 *   POST /personal          → add new personal skill
 *   DELETE /personal/:id    → remove personal skill
 *
 *   GET  /base/:baseId      → list base skills (collab-gated)
 *   POST /base/:baseId      → add base skill (editor role)
 *   DELETE /base/:baseId/:id → remove base skill
 *
 *   GET  /space/:spaceId    → list space skills (admin-gated)
 *   POST /space/:spaceId    → add space skill
 *   DELETE /space/:spaceId/:id → remove space skill
 *
 *   GET  /resolve           → resolve effective skills for current user
 *                             (priority personal > base > space > instance)
 *
 * Auth: requires authenticated session (uses NestJS AuthGuard via
 * `ClsService` to extract userId from `cls.user.id`). The guard is
 * inherited from app.module.ts global guards.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../types/cls';
import { SkillScopeService } from './skill-scope.service';
import type { SkillInput } from './skill-scope.service';

const requireUserId = (cls: ClsService<IClsStore>): string => {
  const userId = cls.get('user.id');
  if (!userId || typeof userId !== 'string') {
    throw new Error('authenticated user required');
  }
  return userId;
};

@Controller('api/cuppy/skills')
export class SkillScopeController {
  constructor(
    private readonly skillScope: SkillScopeService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  // ─── Personal ────────────────────────────────────────────
  @Get('personal')
  async listPersonal() {
    const userId = requireUserId(this.cls);
    return { skills: await this.skillScope.listPersonal(userId) };
  }

  @Post('personal')
  @HttpCode(201)
  async addPersonal(@Body() body: SkillInput) {
    const userId = requireUserId(this.cls);
    const skill = await this.skillScope.addPersonal(userId, body);
    return { skill };
  }

  @Delete('personal/:id')
  @HttpCode(204)
  async deletePersonal(@Param('id') id: string) {
    const userId = requireUserId(this.cls);
    await this.skillScope.deletePersonal(userId, id);
  }

  // ─── Base ────────────────────────────────────────────────
  @Get('base/:baseId')
  async listBase(@Param('baseId') baseId: string) {
    const userId = requireUserId(this.cls);
    return { skills: await this.skillScope.listBase(userId, baseId) };
  }

  @Post('base/:baseId')
  @HttpCode(201)
  async addBase(@Param('baseId') baseId: string, @Body() body: SkillInput) {
    const userId = requireUserId(this.cls);
    const skill = await this.skillScope.addBase(userId, baseId, body);
    return { skill };
  }

  @Delete('base/:baseId/:id')
  @HttpCode(204)
  async deleteBase(@Param('baseId') baseId: string, @Param('id') id: string) {
    const userId = requireUserId(this.cls);
    await this.skillScope.deleteBase(userId, baseId, id);
  }

  // ─── Space ───────────────────────────────────────────────
  @Get('space/:spaceId')
  async listSpace(@Param('spaceId') spaceId: string) {
    const userId = requireUserId(this.cls);
    return { skills: await this.skillScope.listSpace(userId, spaceId) };
  }

  @Post('space/:spaceId')
  @HttpCode(201)
  async addSpace(@Param('spaceId') spaceId: string, @Body() body: SkillInput) {
    const userId = requireUserId(this.cls);
    const skill = await this.skillScope.addSpace(userId, spaceId, body);
    return { skill };
  }

  @Delete('space/:spaceId/:id')
  @HttpCode(204)
  async deleteSpace(@Param('spaceId') spaceId: string, @Param('id') id: string) {
    const userId = requireUserId(this.cls);
    await this.skillScope.deleteSpace(userId, spaceId, id);
  }

  // ─── Resolution ─────────────────────────────────────────
  @Get('resolve')
  async resolve(@Param() params: { baseId?: string; spaceId?: string }) {
    const userId = requireUserId(this.cls);
    const ctx: { userId: string; baseId?: string; spaceId?: string } = { userId };
    if (params?.baseId) ctx.baseId = params.baseId;
    if (params?.spaceId) ctx.spaceId = params.spaceId;
    return this.skillScope.resolve(ctx);
  }
}
