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
import { KmsEncryptionAuthService } from './kms-encryption.auth.service';

/**
 * NestJS-injectable wrapper around the pure helper functions exported
 * from `kms-encryption.service.ts`. The underlying helpers are
 * copied verbatim from the supervisor branch — this class only adds a
 * thin DI surface so downstream modules can inject a single service
 * reference.
 */
export class KmsEncryptionService {
  isValidAlgorithm = isValidAlgorithm;
  isValidKeyState = isValidKeyState;
  randomBytes = randomBytes;
  validateCreateKeyInput = validateCreateKeyInput;
  validateEncryptInput = validateEncryptInput;
  byteLengthUtf8 = byteLengthUtf8;
  toBase64 = toBase64;
  fromBase64 = fromBase64;
  makeIv = makeIv;
  makeDek = makeDek;
  encryptWithDek = encryptWithDek;
  decryptWithDek = decryptWithDek;
  buildEnvelope = buildEnvelope;
  parseEnvelope = parseEnvelope;
  pickEncryptionKey = pickEncryptionKey;
  authTagBytes = authTagBytes;
  canDecryptWith = canDecryptWith;
}

@Module({
  providers: [KmsEncryptionService, KmsEncryptionAuthService],
  exports: [KmsEncryptionService, KmsEncryptionAuthService],
})
export class KmsEncryptionModule {}
