/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-ATTACH-2: short-lived attachment download token + virus scan stub.
 *
 * Cloud §ai-chat §attachments security roadmap:
 *   - HMAC-signed download URL with ≤5min TTL
 *   - Optional ClamAV scan on upload (mock by default in OSS)
 *   - Cross-user ACL check before token issuance
 *
 * Token shape (URL-safe base64):
 *   <payload>.<sig>
 *   payload = base64url(JSON { att, user, scope, exp })
 *   sig     = base64url(HMAC_SHA256(payload, secret))
 *
 * The token is intentionally stateless so the backend can validate it
 * in any node without a Redis round-trip.
 */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'node:crypto';

const DEFAULT_TTL_SECONDS = 5 * 60; // 5 minutes

export interface IAttachmentTokenPayload {
  /** attachment id (token) */
  att: string;
  /** user id claiming the token */
  uid: string;
  /** scope: 'read' (download) | 'scan' (re-scan) */
  scope: 'read' | 'scan';
  /** expiry epoch seconds */
  exp: number;
  /** random nonce */
  nonce: string;
}

export interface IVirusScanResult {
  clean: boolean;
  threat?: string;
  engine: 'mock' | 'clamav';
  scannedAt: string;
}

@Injectable()
export class AiChatAttachmentTokenService {
  private readonly secret =
    process.env.AI_CHAT_ATTACHMENT_HMAC_SECRET ??
    'oss-default-attach-hmac-secret-CHANGE-ME-IN-PROD';
  private readonly ttlSeconds = Number.parseInt(
    process.env.AI_CHAT_ATTACHMENT_TOKEN_TTL ?? `${DEFAULT_TTL_SECONDS}`,
    10
  );

  sign(input: {
    attachmentId: string;
    userId: string;
    scope?: 'read' | 'scan';
    ttlSeconds?: number;
  }): string {
    const ttl = input.ttlSeconds ?? this.ttlSeconds;
    const payload: IAttachmentTokenPayload = {
      att: input.attachmentId,
      uid: input.userId,
      scope: input.scope ?? 'read',
      exp: Math.floor(Date.now() / 1000) + ttl,
      nonce: crypto.randomBytes(8).toString('hex'),
    };
    const json = JSON.stringify(payload);
    const encoded = Buffer.from(json, 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', this.secret).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
  }

  verify(token: string): IAttachmentTokenPayload {
    if (!token || typeof token !== 'string') {
      throw new BadRequestException('Attachment token is malformed');
    }
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new BadRequestException('Attachment token is malformed');
    }
    const [encoded, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', this.secret)
      .update(encoded)
      .digest('base64url');

    // Constant-time comparison prevents timing oracles on the HMAC.
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Attachment token signature mismatch');
    }

    let payload: IAttachmentTokenPayload;
    try {
      const json = Buffer.from(encoded, 'base64url').toString('utf8');
      payload = JSON.parse(json);
    } catch {
      throw new BadRequestException('Attachment token payload is not parseable JSON');
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < now) {
      throw new UnauthorizedException('Attachment token has expired');
    }
    if (!payload.att || !payload.uid || !payload.scope) {
      throw new BadRequestException('Attachment token payload is missing required fields');
    }
    return payload;
  }

  /** Verify AND check the user claims the right to access this attachment. */
  verifyForUser(token: string, expectedUserId: string, expectedAttachmentId: string): IAttachmentTokenPayload {
    const p = this.verify(token);
    if (p.uid !== expectedUserId) {
      throw new ForbiddenException('Attachment token was issued for a different user');
    }
    if (p.att !== expectedAttachmentId) {
      throw new NotFoundException('Attachment token does not match this attachment');
    }
    return p;
  }

  /** Mock virus scan — for real ClamAV integration, route through clamd. */
  async scanBuffer(buffer: Buffer, filename: string): Promise<IVirusScanResult> {
    const engine = (process.env.AI_CHAT_VIRUS_ENGINE ?? 'mock') as 'mock' | 'clamav';
    const eicar = buffer.toString('utf8').includes('EICAR-STANDARD-ANTIVIRUS-TEST');
    if (engine === 'mock') {
      return {
        clean: !eicar,
        threat: eicar ? 'EICAR-Test-File' : undefined,
        engine: 'mock',
        scannedAt: new Date().toISOString(),
      };
    }
    // Real ClamAV engine would shell out to `clamd` here. OSS keeps mock.
    throw new BadRequestException(
      `Virus engine '${engine}' is not bundled in OSS; set AI_CHAT_VIRUS_ENGINE=mock or integrate clamd`
    );
  }
}
