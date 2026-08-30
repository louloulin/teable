import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { AuditSourceModule } from '../audit/audit.module';
import { InstanceSkillController } from './instance-skill.controller';
import { InstanceSkillService } from './instance-skill.service';

@Module({
  imports: [PrismaModule, AuditSourceModule],
  controllers: [InstanceSkillController],
  providers: [InstanceSkillService],
  exports: [InstanceSkillService],
})
export class InstanceSkillModule {}
