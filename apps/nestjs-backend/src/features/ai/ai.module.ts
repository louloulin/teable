import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { RecordModule } from '../record/record.module';
import { SettingModule } from '../setting/setting.module';
import { AiGatewayModelsService } from './ai-gateway-models.service';
import { AiStreamingController } from './ai-streaming.controller';
import { AiStreamingService } from './ai-streaming.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [SettingModule, LicenseModule, RecordModule],
  controllers: [AiController, AiStreamingController],
  providers: [AiService, AiGatewayModelsService, AiStreamingService],
  exports: [AiService, AiGatewayModelsService, AiStreamingService],
})
export class AiModule {}
