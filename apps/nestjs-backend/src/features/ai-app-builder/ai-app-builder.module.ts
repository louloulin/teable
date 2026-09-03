import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { LicenseModule } from '../license/license.module';
import { AiAppBuilderController } from './ai-app-builder.controller';
import { AiAppBuilderRuntimeController } from './ai-app-builder-runtime.controller';
import { AiAppBuilderService } from './ai-app-builder.service';
import { AiAppBuilderAuthService } from './ai-app-builder.auth.service';

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [AiAppBuilderController, AiAppBuilderRuntimeController],
  providers: [AiAppBuilderService, AiAppBuilderAuthService],
  exports: [AiAppBuilderService, AiAppBuilderAuthService],
})
export class AiAppBuilderModule {}
