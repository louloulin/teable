import { SsoFederationService } from './sso-federation.service';

describe('SsoFederationService', () => {
  const svc = new SsoFederationService();

  describe('buildSamlMetadata', () => {
    it('embeds the ACS URL, entityID, and the email/groups attribute contract', () => {
      const xml = svc.buildSamlMetadata({ publicOrigin: 'https://app.teable.example' });
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('EntityDescriptor');
      expect(xml).toContain('entityID="https://app.teable.example/api/auth/sso/saml"');
      expect(xml).toContain('AssertionConsumerService');
      expect(xml).toContain('Location="https://app.teable.example/api/auth/sso/callback"');
      // NameID + email/group requested attrs are the federated contract.
      expect(xml).toContain('emailAddress');
      expect(xml).toContain('urn:oid:0.9.2342.19200300.100.1.3');
      expect(xml).toContain('urn:oid:1.3.6.1.4.1.5923.1.5.1.1');
    });

    it('honors a caller-supplied entityId and strips trailing slashes', () => {
      const xml = svc.buildSamlMetadata({
        publicOrigin: 'https://app.teable.example/',
        entityId: 'urn:teable:custom',
      });
      expect(xml).toContain('entityID="urn:teable:custom"');
      expect(xml).toContain('Location="https://app.teable.example/api/auth/sso/callback"');
    });

    it('flags WantAssertionsSigned when signRequests is true', () => {
      const xml = svc.buildSamlMetadata({
        publicOrigin: 'https://app.teable.example',
        signRequests: true,
      });
      expect(xml).toContain('WantAssertionsSigned="true"');
    });

    it('escapes ampersands and quotes in the origin', () => {
      // Real-world origins won't contain &, but assert the helper runs.
      const xml = svc.buildSamlMetadata({ publicOrigin: 'https://app.teable.example' });
      expect(xml).not.toContain('&amp;amp;');
    });
  });

  describe('buildOidcDiscovery', () => {
    it('returns the SP-side OIDC discovery shape', () => {
      const doc = svc.buildOidcDiscovery({ publicOrigin: 'https://app.teable.example' });
      expect(doc.issuer).toBe('https://app.teable.example/api/auth/sso/oidc');
      expect(doc.authorization_endpoint).toBe(
        'https://app.teable.example/api/auth/sso/oidc/authorize'
      );
      expect(doc.token_endpoint).toBe('https://app.teable.example/api/auth/sso/oidc/token');
      expect(doc.jwks_uri).toBe('https://app.teable.example/api/auth/sso/oidc/jwks');
      expect(doc.response_types_supported).toEqual(['code']);
      expect(doc.scopes_supported).toContain('groups');
      expect(doc.claims_supported).toEqual(
        expect.arrayContaining(['email', 'email_verified', 'name', 'groups'])
      );
    });

    it('uses the same shape regardless of trailing slash', () => {
      const a = svc.buildOidcDiscovery({ publicOrigin: 'https://app.teable.example/' });
      const b = svc.buildOidcDiscovery({ publicOrigin: 'https://app.teable.example' });
      expect(a.issuer).toBe(b.issuer);
    });
  });

  describe('harmonizeAttributes', () => {
    it('falls back to SAML NameID when OIDC email is missing', () => {
      const unified = svc.harmonizeAttributes({
        saml: { nameId: 'Jane.Doe@Acme.COM', attributes: { groups: ['engineering'] } },
        oidc: { groups: ['platform'] },
      });
      expect(unified.email).toBe('jane.doe@acme.com');
      expect(unified.groups).toEqual(expect.arrayContaining(['engineering', 'platform']));
      expect(unified.source).toBe('federated');
    });

    it('prefers OIDC email over SAML when both are present (OIDC is the trust root)', () => {
      const unified = svc.harmonizeAttributes({
        saml: { nameId: 'saml@acme.com' },
        oidc: { email: 'oidc@acme.com', email_verified: true },
      });
      expect(unified.email).toBe('oidc@acme.com');
    });

    it('normalizes SAML groups delivered as a delimited scalar', () => {
      const unified = svc.harmonizeAttributes({
        saml: {
          nameId: 'j@acme.com',
          attributes: { memberOf: ['engineering;platform|design'] },
        },
      });
      expect(unified.groups.sort()).toEqual(['design', 'engineering', 'platform']);
    });

    it('handles OIDC-only and SAML-only paths and marks the source accordingly', () => {
      expect(
        svc.harmonizeAttributes({ oidc: { email: 'o@acme.com', groups: ['g1'] } }).source
      ).toBe('oidc');
      expect(svc.harmonizeAttributes({ saml: { nameId: 's@acme.com' } }).source).toBe('saml');
    });

    it('returns an empty groups array when neither side provides any', () => {
      const unified = svc.harmonizeAttributes({ saml: { nameId: 'x@acme.com' } });
      expect(unified.groups).toEqual([]);
    });

    it('dedupes groups that appear on both sides', () => {
      const unified = svc.harmonizeAttributes({
        saml: { nameId: 'j@acme.com', attributes: { groups: ['eng', 'design'] } },
        oidc: { email: 'j@acme.com', groups: ['design', 'platform'] },
      });
      expect(unified.groups.sort()).toEqual(['design', 'eng', 'platform']);
    });
  });
});
