import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { LicenseModule } from '../license/license.module';
import { MapViewAuthController } from './map-view.auth.controller';
import { MapViewAuthService } from './map-view.auth.service';

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [MapViewAuthController],
  providers: [MapViewAuthService],
  exports: [MapViewAuthService],
})
export class MapViewModule {}
