import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { LicenseModule } from '../license/license.module';
import { TableOpenApiModule } from '../table/open-api/table-open-api.module';
import { AiBuilderAuthService, LLM_PROVIDER } from './ai-builder.auth.service';
import { AiBuilderController } from './ai-builder.controller';
import { AiServiceBuilderProvider } from './ai-service-builder.provider';

@Module({
  imports: [AiModule, LicenseModule, TableOpenApiModule],
  controllers: [AiBuilderController],
  providers: [
    AiBuilderAuthService,
    AiServiceBuilderProvider,
    { provide: LLM_PROVIDER, useExisting: AiServiceBuilderProvider },
  ],
  exports: [AiBuilderAuthService],
})
export class AiBuilderModule {}
