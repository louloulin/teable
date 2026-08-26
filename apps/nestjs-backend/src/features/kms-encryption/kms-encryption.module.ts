import { Module } from '@nestjs/common';

import {
  authTagBytes,
  buildEnvelope,
  byteLengthUtf8,
  canDecryptWith,
  decryptWithDek,
  encryptWithDek,
  fromBase64,
  isValidAlgorithm,
  isValidKeyState,
  makeDek,
  makeIv,
  parseEnvelope,
  pickEncryptionKey,
  randomBytes,
  toBase64,
  validateCreateKeyInput,
  validateEncryptInput,
} from './kms-encryption.service';

/**
 * Pure-function helpers for KMS encryption — no Nest DI surface, consumed
 * directly by callers. Wave 6 surfaces that the previous thin-DI wrapper
 * class was never @Injectable() and could not be wired; we removed it.
 */
export const KmsEncryptionService = {
  isValidAlgorithm,
  isValidKeyState,
  randomBytes,
  validateCreateKeyInput,
  validateEncryptInput,
  byteLengthUtf8,
  toBase64,
  fromBase64,
  makeIv,
  makeDek,
  encryptWithDek,
  decryptWithDek,
  buildEnvelope,
  parseEnvelope,
  pickEncryptionKey,
  authTagBytes,
  canDecryptWith,
};

@Module({})
export class KmsEncryptionModule {}
