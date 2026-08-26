import { Module } from '@nestjs/common';

import {
  buildKeyRow,
  daysUntilRotation,
  decryptWithDek,
  encryptWithDek,
  envelopeHash,
  generateAlias,
  generateDek,
  isRotationDue,
  isValidAlias,
  normalizeMasterKey,
  parseRotationPolicy,
  stringifyRotationPolicy,
  unwrapDek,
  wrapDek,
} from './byok-kms.service';
import { ByokKmsAuthService, LocalMasterKeyProvider } from './byok-kms.auth.service';

/**
 * NestJS-injectable wrapper around the pure helper functions exported
 * from `byok-kms.service.ts`. The underlying helpers are
 * copied verbatim from the supervisor branch — this class only adds a
 * thin DI surface so downstream modules can inject a single service
 * reference.
 */
export class ByokKmsService {
  generateAlias = generateAlias;
  isValidAlias = isValidAlias;
  generateDek = generateDek;
  encryptWithDek = encryptWithDek;
  decryptWithDek = decryptWithDek;
  wrapDek = wrapDek;
  unwrapDek = unwrapDek;
  envelopeHash = envelopeHash;
  isRotationDue = isRotationDue;
  daysUntilRotation = daysUntilRotation;
  parseRotationPolicy = parseRotationPolicy;
  stringifyRotationPolicy = stringifyRotationPolicy;
  buildKeyRow = buildKeyRow;
  normalizeMasterKey = normalizeMasterKey;
}

@Module({
  providers: [ByokKmsService, ByokKmsAuthService, LocalMasterKeyProvider],
  exports: [ByokKmsService, ByokKmsAuthService, LocalMasterKeyProvider],
})
export class ByokKmsModule {}
