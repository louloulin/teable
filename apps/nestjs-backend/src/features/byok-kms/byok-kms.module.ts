import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import {
  ByokKmsAuthService,
  LocalMasterKeyProvider,
} from './byok-kms.auth.service';
import { ByokKmsController } from './byok-kms.controller';

/**
 * BYOK KMS HTTP module.
 *
 * Wires the existing ByokKmsAuthService (customer master keys + envelope
 * encryption + rotation policy + audit log) to HTTP. The service layer
 * is unchanged — Stage 35 already shipped it. The only missing piece
 * was the controller + module registration in app.module.ts.
 *
 * LocalMasterKeyProvider is the default master-key resolver. For real
 * cloud deployments inject an AWS/GCP/Vault provider instead — Nest
 * picks the concrete IMasterKeyProvider automatically.
 *
 * Routes (all under /api/admin/byok-kms):
 *   POST   /keys                                register a customer master key
 *   GET    /keys/:orgId                         list keys for an org
 *   GET    /keys/:orgId/:alias                  load one key
 *   DELETE /keys/:orgId/:alias                  disable a key
 *   POST   /keys/:orgId/:alias/rotate           rotate a key
 *   GET    /rotation-due/:orgId                 list keys due for rotation
 *   POST   /encrypt                             encrypt plaintext for an org
 *   POST   /decrypt                             decrypt ciphertext for an org
 *   GET    /audit/:orgId                        read the audit log
 */
@Module({
  imports: [PrismaModule],
  controllers: [ByokKmsController],
  providers: [LocalMasterKeyProvider, ByokKmsAuthService],
  exports: [ByokKmsAuthService, LocalMasterKeyProvider],
})
export class ByokKmsModule {}
