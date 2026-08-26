/* eslint-disable @typescript-eslint/naming-convention */
import { Module } from '@nestjs/common';
import { OpenApiDocController } from './openapi-doc.controller';

@Module({
  controllers: [OpenApiDocController],
})
export class OpenApiDocModule {}
