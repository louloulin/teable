import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import multer from 'multer';
import { AttachmentsCropModule } from '../../attachments/attachments-crop.module';
import { StorageModule } from '../../attachments/plugins/storage.module';
import { LicenseModule } from '../../license/license.module';
import { NotificationModule } from '../../notification/notification.module';
import { DeleteUserModule } from '../../user/delete-user/delete-user.module';
import { AdminOpenApiController } from './admin-open-api.controller';
import { AdminOpenApiService } from './admin-open-api.service';

@Module({
  imports: [
    AttachmentsCropModule,
    MulterModule.register({
      storage: multer.diskStorage({}),
    }),
    StorageModule,
    NotificationModule,
    DeleteUserModule,
    LicenseModule,
  ],
  controllers: [AdminOpenApiController],
  exports: [AdminOpenApiService],
  providers: [AdminOpenApiService],
})
export class AdminOpenApiModule {}
