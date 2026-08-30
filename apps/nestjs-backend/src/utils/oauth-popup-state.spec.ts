import { createOAuthPopupState, oauthPopupHtml, verifyOAuthPopupState } from './oauth-popup-state';

describe('oauth popup state', () => {
  it('binds a signed state to its provider and space', () => {
    const state = createOAuthPopupState('google-sheets', 'spc-1');
    expect(verifyOAuthPopupState(state, 'google-sheets')).toEqual({ spaceId: 'spc-1' });
    expect(verifyOAuthPopupState(state, 'notion')).toBeNull();
    expect(verifyOAuthPopupState(`${state}tampered`, 'google-sheets')).toBeNull();
  });

  it('rejects malformed and expired states', () => {
    expect(verifyOAuthPopupState(undefined, 'notion')).toBeNull();
    expect(verifyOAuthPopupState('invalid', 'notion')).toBeNull();
    const now = Date.now;
    Date.now = () => now() + 11 * 60 * 1000;
    try {
      const state = createOAuthPopupState('notion', 'spc-2');
      Date.now = () => now() + 22 * 60 * 1000;
      expect(verifyOAuthPopupState(state, 'notion')).toBeNull();
    } finally {
      Date.now = now;
    }
  });

  it('escapes callback message data in the popup document', () => {
    const html = oauthPopupHtml({
      type: 'notion-oauth-code',
      targetOrigin: 'https://example.test',
      code: '</script><script>alert(1)</script>',
    });
    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('https://example.test');
  });

  it('does not use a deterministic signing key in production', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSecret = process.env.SECRET_KEY;
    process.env.NODE_ENV = 'production';
    delete process.env.SECRET_KEY;
    try {
      expect(() => createOAuthPopupState('notion', 'spc-production')).toThrow(
        'SECRET_KEY is required for OAuth popup state signing in production'
      );
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousSecret === undefined) delete process.env.SECRET_KEY;
      else process.env.SECRET_KEY = previousSecret;
    }
  });
});
