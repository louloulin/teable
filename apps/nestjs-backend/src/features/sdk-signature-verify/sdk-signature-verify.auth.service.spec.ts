/**
 * SDK Signature Verify — NestJS auth service spec (Stage 121).
 */

import { SdkSignatureVerifyAuthService } from './sdk-signature-verify.auth.service';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}
function makePrisma(): IPrismaMock { return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }; }
function setup() {
  return new SdkSignatureVerifyAuthService(makePrisma() as never);
}

describe('SdkSignatureVerifyAuthService.digest / supported', () => {
  it('digest', () => {
    expect(setup().digest('hello').length).toBe(64);
  });
  it('supported', () => {
    expect(setup().supported('ed25519')).toBe(true);
    expect(setup().supported('xx')).toBe(false);
  });
});

describe('SdkSignatureVerifyAuthService.signArtifact + verify', () => {
  it('round trip', () => {
    const svc = setup();
    const k = svc.testKey('k1');
    const a = svc.signArtifact(k, 'a.tgz', 'hello', 'ed25519');
    expect(svc.verify(k, a).ok).toBe(true);
  });
  it('verifyArtifact via store', () => {
    const svc = setup();
    const k = svc.testKey('k1');
    const a = svc.signArtifact(k, 'a', 'x', 'ed25519');
    expect(svc.verifyArtifact(new Map([['k1', k]]), a).ok).toBe(true);
  });
});

describe('SdkSignatureVerifyAuthService.bundle', () => {
  it('build + verify', () => {
    const svc = setup();
    const k = svc.testKey('k1');
    const a = svc.signArtifact(k, 'a', 'x', 'ed25519');
    const bundle = svc.build([a]);
    expect(svc.verifyBundle(new Map([['k1', k]]), bundle).ok).toBe(true);
  });
});

describe('SdkSignatureVerifyAuthService.testKey / ping', () => {
  it('testKey', () => {
    const k = setup().testKey('k');
    expect(k.id).toBe('k');
    expect(k.privateKey).toBeDefined();
  });
  it('ping', async () => {
    expect(await setup().ping()).toBe(true);
  });
});