import { Module } from '@nestjs/common';
import { DataMaskingAuthService } from './data-masking.auth.service';
import { DataMaskingController } from './data-masking.controller';

@Module({
  controllers: [DataMaskingController],
  providers: [DataMaskingAuthService],
  exports: [DataMaskingAuthService],
})
export class DataMaskingModule {}
