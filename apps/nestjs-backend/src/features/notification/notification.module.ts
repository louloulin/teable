import { Module } from '@nestjs/common';
import { ShareDbModule } from '../../share-db/share-db.module';
import { MailSenderModule } from '../mail-sender/mail-sender.module';
import { UserModule } from '../user/user.module';
import { NotificationAuthService } from './notification.auth.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [ShareDbModule, UserModule, MailSenderModule.register()],
  controllers: [NotificationController],
  // thin-DI wrapper layer (Wave 7 / Batch 4) — preserves the legacy
  // NotificationService provider and adds NotificationAuthService for the
  // read-only thin-DI surface.
  providers: [NotificationService, NotificationAuthService],
  exports: [NotificationService, NotificationAuthService],
})
export class NotificationModule {}
