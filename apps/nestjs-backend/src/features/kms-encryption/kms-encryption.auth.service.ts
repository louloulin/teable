import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildEnvelope,
  byteLengthUtf8,
  canDecryptWith,
  decryptWithDek,
  encryptWithDek,
  isValidAlgorithm,
  isValidKeyState,
  makeDek,
  makeIv,
  parseEnvelope,
  pickEncryptionKey,
  validateCreateKeyInput,
  validateEncryptInput,
  IKmsProvider,
} from './kms-encryption.service';
import type {
  EncryptionAlgorithm,
  ICreateKeyInput,
  IEncryptInput,
  IEncryptionEnvelope,
  IEncryptionKey,
  KeyState,
} from './kms-encryption.types';
import { DEFAULT_ENCRYPTION_ALGORITHM, KEY_ID_PREFIX } from './kms-encryption.types';

@Injectable()
export class KmsEncryptionAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kms: IKmsProvider
  ) {}

  async createKey(input: ICreateKeyInput): Promise<IEncryptionKey> {
    validateCreateKeyInput(input);
    const id = `${KEY_ID_PREFIX}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.encryptionKey.create({
      data: {
        id,
        kid: input.kid,
        algorithm: input.algorithm ?? DEFAULT_ENCRYPTION_ALGORITHM,
        alias: input.alias ?? null,
        state: 'enabled',
      },
    });
    return toKey(row);
  }

  async listKeys(): Promise<IEncryptionKey[]> {
    const rows = await this.prisma.encryptionKey.findMany({
      orderBy: { createdTime: 'desc' },
    });
    return rows.map(toKey);
  }

  async getKey(id: string): Promise<IEncryptionKey> {
    const row = await this.prisma.encryptionKey.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`key not found: ${id}`);
    return toKey(row);
  }

  async findKeyByKid(kid: string): Promise<IEncryptionKey | undefined> {
    const row = await this.prisma.encryptionKey.findUnique({ where: { kid } });
    return row ? toKey(row) : undefined;
  }

  async updateKeyState(
    id: string,
    patch: { state?: KeyState; retiredAt?: Date; alias?: string }
  ): Promise<IEncryptionKey> {
    const existing = await this.prisma.encryptionKey.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`key not found: ${id}`);
    if (patch.state && !isValidKeyState(patch.state)) {
      throw new Error(`invalid state: ${patch.state}`);
    }
    const updated = await this.prisma.encryptionKey.update({
      where: { id },
      data: {
        state: patch.state ?? undefined,
        retiredAt: patch.retiredAt ?? undefined,
        alias: patch.alias ?? undefined,
      },
    });
    return toKey(updated);
  }

  async encrypt(input: IEncryptInput): Promise<IEncryptionEnvelope> {
    validateEncryptInput(input);
    const keys = await this.listKeys();
    const key = pickEncryptionKey(keys, input.kid);
    const dek = makeDek();
    const iv = makeIv();
    const aadBytes = input.aad ? new TextEncoder().encode(input.aad) : undefined;
    const ciphertext = encryptWithDek(new TextEncoder().encode(input.plaintext), dek, iv, aadBytes);
    const wrappedDek = await this.kms.wrapDek(dek, key.kid);
    // Layout: [ciphertext bytes][wrappedDek bytes][1-byte wrapped-dek length].
    // Length byte sits at the END so decrypt can read it after a base64
    // round-trip without ambiguity.
    const cipherWithDek = new Uint8Array(ciphertext.length + wrappedDek.length + 1);
    cipherWithDek.set(ciphertext, 0);
    cipherWithDek.set(wrappedDek, ciphertext.length);
    cipherWithDek[cipherWithDek.length - 1] = wrappedDek.length;
    return buildEnvelope({
      kid: key.kid,
      iv,
      ciphertext: cipherWithDek,
      aad: input.aad,
    });
  }

  async decrypt(envelope: IEncryptionEnvelope): Promise<string> {
    const keys = await this.listKeys();
    const guard = canDecryptWith(envelope, keys);
    if (!guard.ok) throw new Error(`cannot decrypt: ${guard.reason}`);
    const parsed = parseEnvelope(envelope);
    if (parsed.ciphertext.length < 1) throw new Error('ciphertext too short');
    const dekLen = parsed.ciphertext[parsed.ciphertext.length - 1];
    if (dekLen === undefined || dekLen < 1) throw new Error('invalid wrapped DEK length');
    const dekStart = parsed.ciphertext.length - 1 - dekLen;
    if (dekStart < 0) throw new Error('ciphertext too short for DEK');
    const wrappedDek = parsed.ciphertext.slice(dekStart, parsed.ciphertext.length - 1);
    const realCipher = parsed.ciphertext.slice(0, dekStart);
    const dek = await this.kms.unwrapDek(wrappedDek, envelope.kid);
    const plainBytes = decryptWithDek(realCipher, dek, parsed.iv, parsed.aad);
    return new TextDecoder().decode(plainBytes);
  }

  isValidAlgorithm = isValidAlgorithm;
  pickEncryptionKey = pickEncryptionKey;
  canDecryptWith = canDecryptWith;
  byteLengthUtf8 = byteLengthUtf8;
}

function toKey(r: {
  id: string;
  kid: string;
  algorithm: string;
  alias: string | null;
  state: string;
  createdTime: Date;
  retiredAt: Date | null;
}): IEncryptionKey {
  return {
    id: r.id,
    kid: r.kid,
    algorithm: r.algorithm as EncryptionAlgorithm,
    alias: r.alias ?? undefined,
    state: r.state as KeyState,
    createdTime: r.createdTime,
    retiredAt: r.retiredAt ?? undefined,
  };
}
