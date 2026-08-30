import { Module } from '@nestjs/common';
import { AttachmentsStorageModule } from '../attachments/attachments-storage.module';
import { BaseModule } from '../base/base.module';
import { ShortLinkModule } from '../short-link/short-link.module';
import { TemplateOpenApiController } from './template-open-api.controller';
import { TemplateAdminController } from './template-admin.controller';
import { TemplateOpenApiService } from './template-open-api.service';
import { TemplatePermalinkService } from './template-permalink.service';

@Module({
  imports: [BaseModule, AttachmentsStorageModule, ShortLinkModule],
  controllers: [TemplateOpenApiController, TemplateAdminController],
  providers: [TemplateOpenApiService, TemplatePermalinkService],
  exports: [TemplateOpenApiService, TemplatePermalinkService],
})
export class TemplateOpenApiModule {}
