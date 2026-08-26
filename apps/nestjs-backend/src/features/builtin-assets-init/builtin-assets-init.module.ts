import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from '../attachments/plugins/storage.module';
import { BuiltinAssetsInitAuthService } from './builtin-assets-init.auth.service';
import { BuiltinAssetsInitService } from './builtin-assets-init.service';

/**
 * Builtin-assets-init module — thin-DI wrapper (Stage N).
 *
 * Adds `BuiltinAssetsInitAuthService` (read-only "is initialised?" probe)
 * alongside the existing upload/lock service. Consumers that only need to
 * query status can depend on this module without inheriting the OnModuleInit
 * side-effects of the full service.
 */
@Module({
  imports: [StorageModule, ConfigModule],
  providers: [BuiltinAssetsInitService, BuiltinAssetsInitAuthService],
  exports: [BuiltinAssetsInitService, BuiltinAssetsInitAuthService],
})
export class BuiltinAssetsInitModule {}
