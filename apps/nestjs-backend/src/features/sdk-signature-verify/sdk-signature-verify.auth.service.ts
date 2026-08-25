/**
 * SDK Signature Verify — NestJS auth service (Stage 121).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildBundle,
  digest,
  isAlgorithmSupported,
  makeTestKey,
  sign,
  signArtifact,
  verify,
  verifyArtifact,
  verifyBundle,
} from './sdk-signature-verify.service';
import {
  BundleVerifyResult,
  SignatureBlob,
  SignatureKeyPair,
  SignedArtifact,
  VerifyResult,
} from './sdk-signature-verify.types';

@Injectable()
export class SdkSignatureVerifyAuthService {
  constructor(private readonly prisma: PrismaService) {}

  digest(payload: string | Uint8Array): string {
    return digest(payload);
  }

  supported(a: string): boolean {
    return isAlgorithmSupported(a);
  }

  sign(key: SignatureKeyPair, d: string, alg: SignatureBlob['algorithm']): SignatureBlob {
    return sign(key, d, alg);
  }

  verify(key: SignatureKeyPair | undefined, signed: SignedArtifact): VerifyResult {
    return verify(key, signed);
  }

  signArtifact(key: SignatureKeyPair, path: string, payload: string | Uint8Array, alg: SignatureBlob['algorithm']): SignedArtifact {
    return signArtifact(key, path, payload, alg);
  }

  verifyArtifact(keyStore: ReadonlyMap<string, SignatureKeyPair>, signed: SignedArtifact): VerifyResult {
    return verifyArtifact(keyStore, signed);
  }

  build(artifacts: readonly SignedArtifact[]) {
    return buildBundle(artifacts);
  }

  verifyBundle(keyStore: ReadonlyMap<string, SignatureKeyPair>, bundle: { entries: readonly import('./sdk-signature-verify.types').BundleEntry[]; signatures: Readonly<Record<string, SignatureBlob>> }): BundleVerifyResult {
    return verifyBundle(keyStore, bundle);
  }

  testKey(id: string): SignatureKeyPair {
    return makeTestKey(id);
  }

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}