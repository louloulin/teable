import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { SettingModule } from '../setting/setting.module';
import { SandboxAgentController } from './sandbox-agent.controller';
import { SandboxAgentService } from './sandbox-agent.service';

@Module({
  imports: [SettingModule, LicenseModule],
  controllers: [SandboxAgentController],
  providers: [SandboxAgentService],
  exports: [SandboxAgentService],
})
export class SandboxAgentModule {}
