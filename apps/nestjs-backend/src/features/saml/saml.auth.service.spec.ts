import { BadRequestException } from '@nestjs/common';
import { vi } from 'vitest';
import { SamlAuthService } from './saml.auth.service';

interface MockSsoLoginState {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}
interface MockSsoIdentityProvider {
  findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
}
interface MockPrisma {
  ssoLoginState: MockSsoLoginState;
  ssoIdentityProvider: MockSsoIdentityProvider;
}

const buildPrisma = (): MockPrisma => ({
  ssoLoginState: {
    create: vi.fn(async ({ data }) => data),
    findUnique: vi.fn(async () => null),
    update: vi.fn(async ({ where, data }) => ({ ...data, state: where.state })),
  },
  ssoIdentityProvider: {
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async () => null),
  },
});

const providerRow = {
  id: 'idp_1',
  organizationId: 'org_1',
  issuer: 'https://idp.example.com/saml',
  ssoUrl: 'https://idp.example.com/sso',
  emailDomain: 'example.com',
  status: 'active',
  type: 'saml',
};

const sampleAssertion =
  '<saml:Assertion><saml:Subject><saml:NameID>alice@example.com</saml:NameID></saml:Subject>' +
  '<saml:AttributeStatement>' +
  '<saml:Attribute Name="email"><saml:AttributeValue>alice@example.com</saml:AttributeValue></saml:Attribute>' +
  '<saml:Attribute Name="givenName"><saml:AttributeValue>Alice</saml:AttributeValue></saml:Attribute>' +
  '</saml:AttributeStatement></saml:Assertion>';

const sampleResponseXml =
  '<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">' +
  sampleAssertion +
  '</samlp:Response>';
const base64Response = Buffer.from(sampleResponseXml, 'utf-8').toString('base64');

describe('SamlAuthService (Stage 21)', () => {
  let prisma: MockPrisma;
  let svc: SamlAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new SamlAuthService(prisma as never);
  });

  describe('startLogin', () => {
    it('finds the provider by domain and writes a state row', async () => {
      prisma.ssoIdentityProvider.findFirst.mockResolvedValueOnce(providerRow);
      const out = await svc.startLogin({
        organizationId: 'org_1',
        emailId: 'alice@example.com',
        returnTo: '/dash',
        spEntityId: 'https://app/ac',
        acsUrl: 'https://app/ac',
      });
      expect(out.redirectUrl).toMatch(/^https:\/\/idp\.example\.com\/sso/);
      expect(out.redirectUrl).toContain('SAMLRequest=');
      expect(out.redirectUrl).toContain('RelayState=saml_');
      expect(out.stateId).toMatch(/^saml_/);
      expect(out.authnHash).toMatch(/^[a-f0-9]{32}$/);
      expect(prisma.ssoLoginState.create).toHaveBeenCalledTimes(1);
    });

    it('rejects when no provider matches the domain', async () => {
      prisma.ssoIdentityProvider.findFirst.mockResolvedValueOnce(null);
      await expect(
        svc.startLogin({
          organizationId: 'org_1',
          emailId: 'bob@unknown.com',
          spEntityId: 'x',
          acsUrl: 'y',
        })
      ).rejects.toThrow(/no SAML provider/);
    });

    it('rejects when the matched provider is disabled', async () => {
      prisma.ssoIdentityProvider.findFirst.mockResolvedValueOnce({
        ...providerRow,
        status: 'disabled',
      });
      await expect(
        svc.startLogin({
          organizationId: 'org_1',
          emailId: 'alice@example.com',
          spEntityId: 'x',
          acsUrl: 'y',
        })
      ).rejects.toThrow(/disabled/);
    });

    it('falls back to a provider lookup when no emailId supplied', async () => {
      prisma.ssoIdentityProvider.findFirst.mockResolvedValueOnce(providerRow);
      await svc.startLogin({
        organizationId: 'org_1',
        spEntityId: 'x',
        acsUrl: 'y',
      });
      expect(prisma.ssoIdentityProvider.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org_1', status: 'active', type: 'saml' },
      });
    });
  });

  describe('completeLogin', () => {
    it('rejects when state is missing', async () => {
      prisma.ssoLoginState.findUnique.mockResolvedValueOnce(null);
      await expect(
        svc.completeLogin({ samlResponse: base64Response, relayState: 'saml_xxx' })
      ).rejects.toThrow(/invalid state/);
    });

    it('rejects when state was already consumed', async () => {
      prisma.ssoLoginState.findUnique.mockResolvedValueOnce({
        state: 'saml_xxx',
        organizationId: 'org_1',
        providerId: 'idp_1',
        redirectTo: null,
        consumed: true,
        expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(
        svc.completeLogin({ samlResponse: base64Response, relayState: 'saml_xxx' })
      ).rejects.toThrow(/consumed/);
    });

    it('rejects when state is expired', async () => {
      prisma.ssoLoginState.findUnique.mockResolvedValueOnce({
        state: 'saml_xxx',
        organizationId: 'org_1',
        providerId: 'idp_1',
        redirectTo: null,
        consumed: false,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        svc.completeLogin({ samlResponse: base64Response, relayState: 'saml_xxx' })
      ).rejects.toThrow(/expired/);
    });

    it('happy path: returns email + display name, marks state consumed', async () => {
      prisma.ssoLoginState.findUnique.mockResolvedValueOnce({
        state: 'saml_xxx',
        organizationId: 'org_1',
        providerId: 'idp_1',
        redirectTo: '/dash',
        consumed: false,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const out = await svc.completeLogin({
        samlResponse: base64Response,
        relayState: 'saml_xxx',
      });
      expect(out.email).toBe('alice@example.com');
      expect(out.givenName).toBe('Alice');
      expect(out.organizationId).toBe('org_1');
      expect(out.returnTo).toBe('/dash');
      expect(prisma.ssoLoginState.update).toHaveBeenCalledWith({
        where: { state: 'saml_xxx' },
        data: { consumed: true },
      });
    });

    it('rejects when the assertion has no email attribute and NameID is unusable', async () => {
      prisma.ssoLoginState.findUnique.mockResolvedValueOnce({
        state: 'saml_xxx',
        organizationId: 'org_1',
        providerId: 'idp_1',
        redirectTo: null,
        consumed: false,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const xml =
        '<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">' +
        '<saml:Assertion><saml:Subject><saml:NameID>no-at-symbol</saml:NameID></saml:Subject></saml:Assertion>' +
        '</samlp:Response>';
      const bad = Buffer.from(xml, 'utf-8').toString('base64');
      await expect(
        svc.completeLogin({ samlResponse: bad, relayState: 'saml_xxx' })
      ).rejects.toThrow(/missing email/);
    });
  });

  describe('buildMetadata', () => {
    it('returns SP metadata XML', () => {
      const xml = svc.buildMetadata({
        spEntityId: 'https://app/ac',
        acsUrl: 'https://app/ac',
        name: 'Acme',
      });
      expect(xml).toContain('EntityDescriptor');
      expect(xml).toContain('SPSSODescriptor');
    });
  });
});
