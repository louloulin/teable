/* SPDX-License-Identifier: AGPL-3.0-or-later */
import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { SkillScopeController } from './skill-scope.controller';
import { SkillScopeService } from './skill-scope.service';

@Module({
  imports: [PrismaModule],
  controllers: [SkillScopeController],
  providers: [SkillScopeService],
  exports: [SkillScopeService],
})
export class SkillScopeModule {}
