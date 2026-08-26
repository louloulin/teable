import { Global, Module } from '@nestjs/common';
import { DataLoaderAuthService } from './data-loader.auth.service';
import { DataLoaderService } from './data-loader.service';
import { FieldLoaderService } from './resource/field-loader.service';
import { TableLoaderService } from './resource/table-loader.service';
import { ViewLoaderService } from './resource/view-loader.service';

/**
 * Data-loader — module (Stage 130).
 *
 * `DataLoaderAuthService` is the thin-DI wrapper façade added without
 * disturbing the existing loader surface.
 */
@Global()
@Module({
  providers: [
    DataLoaderService,
    TableLoaderService,
    FieldLoaderService,
    ViewLoaderService,
    DataLoaderAuthService,
  ],
  exports: [DataLoaderService, DataLoaderAuthService],
})
export class DataLoaderModule {}