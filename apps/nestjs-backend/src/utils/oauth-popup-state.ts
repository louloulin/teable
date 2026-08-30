import { createHmac, timingSafeEqual } from 'node:crypto';

export type OAuthPopupProvider = 'google-sheets' | 'notion';

interface IOAuthPopupState {
  provider: OAuthPopupProvider;
  spaceId: string;
  expiresAt: number;
  nonce: string;
}

const STATE_TTL_MS = 10 * 60 * 1000;

const secret = (): string => {
  const configured = process.env.SECRET_KEY?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SECRET_KEY is required for OAuth popup state signing in production');
  }
  return 'teable-oauth-state-development-secret';
};

const encode = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

const signature = (payload: string): string =>
  createHmac('sha256', secret()).update(payload).digest('base64url');

export const createOAuthPopupState = (provider: OAuthPopupProvider, spaceId: string): string => {
  const value: IOAuthPopupState = {
    provider,
    spaceId,
    expiresAt: Date.now() + STATE_TTL_MS,
    nonce: encode(`${Date.now()}:${Math.random()}`),
  };
  const payload = encode(JSON.stringify(value));
  return `${payload}.${signature(payload)}`;
};

export const verifyOAuthPopupState = (
  state: string | undefined,
  provider: OAuthPopupProvider
): { spaceId: string } | null => {
  if (!state) return null;
  const [payload, suppliedSignature] = state.split('.');
  if (!payload || !suppliedSignature) return null;
  const expectedSignature = signature(payload);
  const supplied = Buffer.from(suppliedSignature, 'base64url');
  const expected = Buffer.from(expectedSignature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const value = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as IOAuthPopupState;
    if (
      value.provider !== provider ||
      typeof value.spaceId !== 'string' ||
      value.spaceId.length === 0 ||
      typeof value.expiresAt !== 'number' ||
      value.expiresAt <= Date.now()
    ) {
      return null;
    }
    return { spaceId: value.spaceId };
  } catch {
    return null;
  }
};

export const oauthPopupHtml = (args: {
  type: string;
  targetOrigin: string;
  code?: string;
  state?: string;
  error?: string;
}): string => {
  const message = JSON.stringify({
    type: args.type,
    ...(args.code ? { code: args.code } : {}),
    ...(args.state ? { state: args.state } : {}),
    ...(args.error ? { error: args.error } : {}),
  }).replace(/</g, '\\u003c');
  const targetOrigin = JSON.stringify(args.targetOrigin).replace(/</g, '\\u003c');
  return `<!doctype html><meta charset="utf-8"><title>Teable OAuth</title><script>window.opener?.postMessage(${message},${targetOrigin});window.close();</script><p>OAuth complete. You can close this window.</p>`;
};
