import {
  buildAuthnRequest,
  buildMetadataXml,
  buildRedirectUrl,
  extractDisplayName,
  extractEmailFromAssertion,
  hashAuthnRequest,
  parseSamlResponse,
} from './saml.service';
import { inflateSync } from 'zlib';

describe('SAML 2.0 helpers (Stage 21)', () => {
  const sampleProvider = {
    issuer: 'https://idp.example.com/saml/metadata',
    ssoUrl: 'https://idp.example.com/saml/sso',
    spEntityId: 'https://app.example.com/api/auth/saml/callback',
    acsUrl: 'https://app.example.com/api/auth/saml/acs',
    stateId: 'abc123',
  };

  describe('buildAuthnRequest', () => {
    it('produces XML, deflated bytes, and base64 — all reversible', () => {
      const out = buildAuthnRequest(sampleProvider);
      expect(out.xml).toContain('<samlp:AuthnRequest');
      expect(out.xml).toContain(`AssertionConsumerServiceURL="${sampleProvider.acsUrl}"`);
      expect(out.xml).toContain(`<saml:Issuer>${sampleProvider.spEntityId}</saml:Issuer>`);
      // round-trip via inflate
      const inflated = inflateSync(Buffer.from(out.encoded, 'base64')).toString('utf-8');
      expect(inflated).toBe(out.xml);
    });

    it('uses ForceAuthn=true when requested', () => {
      const out = buildAuthnRequest({ ...sampleProvider, forceAuthn: true });
      expect(out.xml).toContain('ForceAuthn="true"');
    });

    it('bakes the supplied issueInstant verbatim', () => {
      const fixed = '2026-08-25T00:00:00.000Z';
      const out = buildAuthnRequest({ ...sampleProvider, issueInstant: fixed });
      expect(out.xml).toContain(`IssueInstant="${fixed}"`);
    });

    it('omits ForceAuthn when not requested', () => {
      const out = buildAuthnRequest(sampleProvider);
      expect(out.xml).not.toContain('ForceAuthn=');
    });
  });

  describe('buildRedirectUrl', () => {
    it('appends SAMLRequest + RelayState to the IdP SSO URL', () => {
      const url = buildRedirectUrl(sampleProvider.ssoUrl, 'AAA=', sampleProvider.stateId);
      const u = new URL(url);
      expect(u.origin + u.pathname).toBe('https://idp.example.com/saml/sso');
      expect(u.searchParams.get('SAMLRequest')).toBe('AAA=');
      expect(u.searchParams.get('RelayState')).toBe('abc123');
    });

    it('preserves pre-existing query parameters on the SSO URL', () => {
      const url = buildRedirectUrl(`${sampleProvider.ssoUrl}?partnerId=acme`, 'AAA=', 's1');
      expect(url).toContain('partnerId=acme');
      expect(url).toContain('SAMLRequest=AAA%3D');
    });
  });

  describe('buildMetadataXml', () => {
    it('emits a self-describing SP descriptor with ACS + NameID', () => {
      const xml = buildMetadataXml({
        entityId: sampleProvider.spEntityId,
        acsUrl: sampleProvider.acsUrl,
        name: 'Acme Workspace',
      });
      expect(xml).toContain('EntityDescriptor');
      expect(xml).toContain(`entityID="${sampleProvider.spEntityId}"`);
      expect(xml).toContain('SPSSODescriptor');
      expect(xml).toContain(`Location="${sampleProvider.acsUrl}"`);
      expect(xml).toContain('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress');
    });

    it('XML-escapes hostile characters in the entityID', () => {
      const xml = buildMetadataXml({
        entityId: 'https://app.example.com/?x="1"&y=<2>',
        acsUrl: sampleProvider.acsUrl,
        name: 'Test',
      });
      expect(xml).not.toContain('x="1"');
      expect(xml).toContain('&quot;');
      expect(xml).toContain('&amp;');
      expect(xml).toContain('&lt;2&gt;');
    });
  });

  describe('parseSamlResponse', () => {
    const base64Response = (xml: string): string => Buffer.from(xml, 'utf-8').toString('base64');

    it('decodes a base64 SAMLResponse, extracts NameID + attributes', () => {
      const xml =
        `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ` +
        `xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">` +
        `<saml:Assertion>` +
        `<saml:Subject><saml:NameID>alice@example.com</saml:NameID></saml:Subject>` +
        `<saml:AttributeStatement>` +
        `<saml:Attribute Name="email"><saml:AttributeValue>alice@example.com</saml:AttributeValue></saml:Attribute>` +
        `<saml:Attribute Name="givenName"><saml:AttributeValue>Alice</saml:AttributeValue></saml:Attribute>` +
        `<saml:Attribute Name="surname"><saml:AttributeValue>Park</saml:AttributeValue></saml:Attribute>` +
        `</saml:AttributeStatement>` +
        `</saml:Assertion>` +
        `</samlp:Response>`;
      const parsed = parseSamlResponse(base64Response(xml));
      expect(parsed.assertion.nameId).toBe('alice@example.com');
      expect(parsed.assertion.attributes['email']).toBe('alice@example.com');
      expect(parsed.assertion.attributes['givenName']).toBe('Alice');
    });

    it('accepts raw XML (no base64 wrapper)', () => {
      const xml =
        `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ` +
        `xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">` +
        `<saml:Assertion><saml:Subject><saml:NameID>bob@example.com</saml:NameID></saml:Subject></saml:Assertion>` +
        `</samlp:Response>`;
      const parsed = parseSamlResponse(xml);
      expect(parsed.assertion.nameId).toBe('bob@example.com');
    });

    it('extracts SessionIndex when present', () => {
      const xml =
        `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ` +
        `xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">` +
        `<saml:Assertion AuthnStatementID="abc" SessionIndex="_ses1">` +
        `<saml:Subject><saml:NameID>x@y.com</saml:NameID></saml:Subject>` +
        `<saml:AuthnStatement SessionIndex="_ses1"/>` +
        `</saml:Assertion></samlp:Response>`;
      const parsed = parseSamlResponse(base64Response(xml));
      expect(parsed.assertion.sessionIndex).toBe('_ses1');
    });

    it('parses NotOnOrAfter from Conditions when present', () => {
      const xml =
        `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ` +
        `xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">` +
        `<saml:Assertion>` +
        `<saml:Subject><saml:NameID>x@y.com</saml:NameID></saml:Subject>` +
        `<saml:Conditions NotOnOrAfter="2099-01-01T00:00:00Z"/>` +
        `</saml:Assertion></samlp:Response>`;
      const parsed = parseSamlResponse(base64Response(xml));
      expect(parsed.assertion.notOnOrAfter).toBe(Date.parse('2099-01-01T00:00:00Z'));
    });

    it('throws when Assertion is missing', () => {
      const xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"/>`;
      expect(() => parseSamlResponse(base64Response(xml))).toThrow(/missing Assertion/);
    });

    it('throws when Subject is missing', () => {
      const xml =
        `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ` +
        `xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">` +
        `<saml:Assertion/></samlp:Response>`;
      expect(() => parseSamlResponse(base64Response(xml))).toThrow(/missing Subject/);
    });

    it('throws when NameID is missing', () => {
      const xml =
        `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ` +
        `xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">` +
        `<saml:Assertion><saml:Subject/></saml:Assertion></samlp:Response>`;
      expect(() => parseSamlResponse(base64Response(xml))).toThrow(/missing NameID/);
    });
  });

  describe('extractEmailFromAssertion', () => {
    it('prefers the email attribute over NameID', () => {
      expect(
        extractEmailFromAssertion({
          nameId: 'random-string',
          attributes: { email: 'alice@example.com' },
        })
      ).toBe('alice@example.com');
    });

    it('falls back to NameID when no email attribute', () => {
      expect(
        extractEmailFromAssertion({
          nameId: 'fallback@example.com',
          attributes: { givenName: 'Alice' },
        })
      ).toBe('fallback@example.com');
    });

    it('handles the urn:oid LDAP attribute name', () => {
      expect(
        extractEmailFromAssertion({
          nameId: 'x',
          attributes: { 'urn:oid:0.9.2342.19200300.100.1.3': 'ldap@example.com' },
        })
      ).toBe('ldap@example.com');
    });
  });

  describe('extractDisplayName', () => {
    it('returns given + family names when provided', () => {
      const out = extractDisplayName({
        attributes: { givenName: 'Alice', surname: 'Park' },
      });
      expect(out).toEqual({ givenName: 'Alice', surname: 'Park' });
    });

    it('returns only the cn when given/surname absent', () => {
      expect(extractDisplayName({ attributes: { cn: 'Alice P.' } })).toEqual({
        givenName: 'Alice P.',
        surname: undefined,
      });
    });

    it('returns both undefined when no attributes', () => {
      expect(extractDisplayName({ attributes: {} })).toEqual({
        givenName: undefined,
        surname: undefined,
      });
    });
  });

  describe('hashAuthnRequest', () => {
    it('produces a stable 32-char hex digest', () => {
      const xml = '<samlp:AuthnRequest ID="_1"/>';
      const h1 = hashAuthnRequest(xml);
      const h2 = hashAuthnRequest(xml);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[a-f0-9]{32}$/);
    });
  });
});
