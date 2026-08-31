import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Request, Response } from 'express';

import { SamlController } from './saml.controller';

interface IReqOverrides {
  login?: (user: unknown, cb: (err?: Error | null) => void) => void;
}
interface IResOverrides {
  redirect?: import('vitest').Mock;
}

/**
 * Stage 9 controller tests — exercise the public SAML endpoints
 * without spinning up Nest so we stay isolated from Prisma. The two
 * collaborators (`SamlAuthService`, `SsoAuthService`) are hand-rolled
 * stubs that record the calls and let each test choose its outcome.
 */
function makeRes(): Response {
  return {
    redirect: vi.fn(),
  } as unknown as Response & IResOverrides;
}

function makeReq(loginImpl: (cb: (err?: Error | null) => void) => void): Request {
  return {
    login: (user: unknown, cb: (err?: Error | null) => void) => loginImpl(cb),
  } as unknown as Request & IReqOverrides;
}

describe('SamlController', () => {
  const originalOrigin = process.env.PUBLIC_ORIGIN;

  afterEach(() => {
    if (originalOrigin === undefined) {
      delete process.env.PUBLIC_ORIGIN;
    } else {
      process.env.PUBLIC_ORIGIN = originalOrigin;
    }
  });

  describe('startLogin', () => {
    it('302s to the IdP SSO URL with a valid email hint', async () => {
      process.env.PUBLIC_ORIGIN = 'https://app.example.com';
      const startLogin = vi.fn().mockResolvedValue({
        redirectUrl: 'https://idp.example.com/sso?SAMLRequest=...',
        stateId: 'saml_state_1',
        authnHash: 'h1',
      });
      const controller = new SamlController(
        { startLogin, completeLogin: vi.fn(), findProviderById: vi.fn() } as never,
        { resolveLocalUser: vi.fn() } as never
      );
      const res = makeRes();
      await controller.startLogin(
        { emailHint: 'alice@acme.com', returnTo: '/dashboard' },
        res
      );
      expect(startLogin).toHaveBeenCalledWith({
        emailId: 'alice@acme.com',
        organizationId: '',
        returnTo: '/dashboard',
        spEntityId: 'https://app.example.com',
        acsUrl: 'https://app.example.com/api/auth/saml/callback',
      });
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        'https://idp.example.com/sso?SAMLRequest=...'
      );
    });

    it('rejects requests missing both emailHint and organizationId', async () => {
      const controller = new SamlController(
        { startLogin: vi.fn(), completeLogin: vi.fn(), findProviderById: vi.fn() } as never,
        { resolveLocalUser: vi.fn() } as never
      );
      await expect(
        controller.startLogin({}, makeRes() as Response)
      ).rejects.toThrow(/emailHint or organizationId required/);
    });
  });

  describe('handleCallback', () => {
    it('writes a local session and 302s to returnTo on success', async () => {
      process.env.PUBLIC_ORIGIN = 'https://app.example.com';
      const completeLogin = vi.fn().mockResolvedValue({
        stateId: 'saml_state_1',
        organizationId: 'org_1',
        providerId: 'pid_1',
        returnTo: '/dashboard',
        email: 'alice@acme.com',
        givenName: 'Alice',
        surname: 'Wong',
      });
      const findProviderById = vi.fn().mockResolvedValue({
        id: 'pid_1',
        organizationId: 'org_1',
        issuer: 'https://idp.acme.com',
        emailDomain: 'acme.com',
        type: 'saml',
      });
      const resolveLocalUser = vi.fn().mockResolvedValue({
        id: 'usr_alice',
        email: 'alice@acme.com',
        name: 'Alice Wong',
      });
      const controller = new SamlController(
        { startLogin: vi.fn(), completeLogin, findProviderById } as never,
        { resolveLocalUser } as never
      );
      const res = makeRes();
      const req = makeReq((cb) => cb(null));
      await controller.handleCallback(
        { SAMLResponse: 'b64xml', RelayState: 'saml_state_1' },
        req,
        res
      );
      expect(resolveLocalUser).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pid_1',
          organizationId: 'org_1',
          emailDomain: 'acme.com',
          type: 'saml',
        }),
        expect.objectContaining({
          email: 'alice@acme.com',
          email_verified: true,
          name: 'Alice Wong',
        })
      );
      expect(res.redirect).toHaveBeenCalledWith(302, '/dashboard');
    });

    it('redirects to error page when SAMLResponse is missing', async () => {
      const controller = new SamlController(
        { startLogin: vi.fn(), completeLogin: vi.fn(), findProviderById: vi.fn() } as never,
        { resolveLocalUser: vi.fn() } as never
      );
      const res = makeRes();
      await expect(
        controller.handleCallback(
          { RelayState: 'saml_state_1' },
          makeReq((cb) => cb(null)) as Request,
          res
        )
      ).rejects.toThrow(/missing SAMLResponse or RelayState/);
    });

    it('falls back to /?sso_error when state is unknown', async () => {
      const completeLogin = vi
        .fn()
        .mockRejectedValue(new Error('state already consumed'));
      const controller = new SamlController(
        { startLogin: vi.fn(), completeLogin, findProviderById: vi.fn() } as never,
        { resolveLocalUser: vi.fn() } as never
      );
      const res = makeRes();
      await controller.handleCallback(
        { SAMLResponse: 'b64xml', RelayState: 'bogus' },
        makeReq((cb) => cb(null)) as Request,
        res
      );
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        '/?sso_error=login_failed'
      );
    });

    it('falls back to /?sso_error when req.login fails', async () => {
      const completeLogin = vi.fn().mockResolvedValue({
        stateId: 'saml_state_1',
        organizationId: 'org_1',
        providerId: 'pid_1',
        returnTo: '/dashboard',
        email: 'alice@acme.com',
      });
      const findProviderById = vi.fn().mockResolvedValue({
        id: 'pid_1',
        organizationId: 'org_1',
        issuer: 'https://idp.acme.com',
        emailDomain: 'acme.com',
        type: 'saml',
      });
      const resolveLocalUser = vi.fn().mockResolvedValue({
        id: 'usr_alice',
        email: 'alice@acme.com',
      });
      const controller = new SamlController(
        { startLogin: vi.fn(), completeLogin, findProviderById } as never,
        { resolveLocalUser } as never
      );
      const res = makeRes();
      const req = makeReq((cb) => cb(new Error('cookie write failed')));
      await controller.handleCallback(
        { SAMLResponse: 'b64xml', RelayState: 'saml_state_1' },
        req,
        res
      );
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        '/?sso_error=login_failed'
      );
    });

    it('falls back to /?sso_error when provider row is missing', async () => {
      const completeLogin = vi.fn().mockResolvedValue({
        stateId: 'saml_state_1',
        organizationId: 'org_1',
        providerId: 'pid_missing',
        returnTo: '/',
        email: 'alice@acme.com',
      });
      const findProviderById = vi.fn().mockResolvedValue(null);
      const controller = new SamlController(
        { startLogin: vi.fn(), completeLogin, findProviderById } as never,
        { resolveLocalUser: vi.fn() } as never
      );
      const res = makeRes();
      await controller.handleCallback(
        { SAMLResponse: 'b64xml', RelayState: 'saml_state_1' },
        makeReq((cb) => cb(null)) as Request,
        res
      );
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        '/?sso_error=login_failed'
      );
    });
  });

  describe('buildMetadata', () => {
    it('returns SP metadata XML derived from PUBLIC_ORIGIN', () => {
      process.env.PUBLIC_ORIGIN = 'https://app.example.com';
      const buildMetadata = vi.fn().mockReturnValue('<xml>...</xml>');
      const controller = new SamlController(
        { startLogin: vi.fn(), completeLogin: vi.fn(), findProviderById: vi.fn() } as never,
        { resolveLocalUser: vi.fn() } as never
      );
      // swap service method via cast — controller delegates to samlAuth.buildMetadata
      (controller as unknown as { samlAuth: { buildMetadata: typeof buildMetadata } }).samlAuth = {
        buildMetadata,
      };
      const out = controller.buildMetadata('AcmeCorp');
      expect(buildMetadata).toHaveBeenCalledWith({
        spEntityId: 'https://app.example.com',
        acsUrl: 'https://app.example.com/api/auth/saml/callback',
        name: 'AcmeCorp',
      });
      expect(out.xml).toBe('<xml>...</xml>');
    });
  });
});
