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

/**
 * Pure-function helpers for BYOK KMS — no Nest DI surface, consumed directly
 * by callers. Wave 6 surfaces that the previous thin-DI wrapper class was
 * never @Injectable() and could not be wired; we removed it. The AuthService
 * surface is also pure (no Nest DI needed).
 */
export const ByokKmsService = {
  generateAlias,
  isValidAlias,
  generateDek,
  encryptWithDek,
  decryptWithDek,
  wrapDek,
  unwrapDek,
  envelopeHash,
  isRotationDue,
  daysUntilRotation,
  parseRotationPolicy,
  stringifyRotationPolicy,
  buildKeyRow,
  normalizeMasterKey,
};

@Module({})
export class ByokKmsModule {}
