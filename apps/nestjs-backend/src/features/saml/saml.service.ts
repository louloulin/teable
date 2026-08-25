/**
 * SAML 2.0 SP helpers — Stage 21.
 *
 * Pure functions used by the SAML controller + service:
 *   - buildAuthnRequest:  base64 + deflate-encoded AuthnRequest URL
 *   - buildMetadataXml:   SP metadata XML for the IdP to import
 *   - parseSamlResponse:  decode + extract the Assertion from a base64 POST
 *
 * XML handling is regex-based (no xml2js dependency). The schema is small
 * and fixed so a hand-rolled parser stays readable + auditable.
 */

import { createHash, randomBytes } from 'crypto';
import { deflateSync, inflateSync } from 'zlib';

export interface IBuildAuthnRequestInput {
  /** IdP entityID. */
  issuer: string;
  /** IdP SingleSignOnService URL (HTTP-Redirect binding target). */
  ssoUrl: string;
  /** Our SP entityID (often the callback URL). */
  spEntityId: string;
  /** URL the IdP POSTs the assertion back to. */
  acsUrl: string;
  /** State token to correlate the IdP response with our login state row. */
  stateId: string;
  /** ISO-8601 timestamp baked into the AuthnRequest; default = now. */
  issueInstant?: string;
  /** Optional forced re-auth (AuthnForceAuthn). */
  forceAuthn?: boolean;
}

/** Default name format for the Subject. */
const DEFAULT_NAME_FORMAT = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';

/**
 * Build the AuthnRequest XML. Deflate + base64-encode it so it fits in a
 * GET query parameter (HTTP-Redirect binding).
 */
export function buildAuthnRequest(input: IBuildAuthnRequestInput): {
  xml: string;
  encoded: string;
  deflated: Buffer;
} {
  const id = `_${randomBytes(16).toString('hex')}`;
  const issueInstant = input.issueInstant ?? new Date().toISOString();
  const forceAuthn = input.forceAuthn ? ' ForceAuthn="true"' : '';
  const xml =
    `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ` +
    `xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ` +
    `ID="${id}" Version="2.0"${forceAuthn} ` +
    `IssueInstant="${issueInstant}" ` +
    `ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" ` +
    `AssertionConsumerServiceURL="${input.acsUrl}">` +
    `<saml:Issuer>${xmlEscape(input.spEntityId)}</saml:Issuer>` +
    `<samlp:NameIDPolicy Format="${DEFAULT_NAME_FORMAT}" AllowCreate="true"/>` +
    `</samlp:AuthnRequest>`;
  const deflated = deflateSync(Buffer.from(xml, 'utf-8'));
  const encoded = deflated.toString('base64');
  return { xml, encoded, deflated };
}

/** Build the IdP-facing redirect URL with AuthnRequest + RelayState (stateId). */
export function buildRedirectUrl(ssoUrl: string, encoded: string, stateId: string): string {
  const u = new URL(ssoUrl);
  u.searchParams.set('SAMLRequest', encoded);
  u.searchParams.set('RelayState', stateId);
  return u.toString();
}

/**
 * Generate SP metadata XML so the IdP admin can import our entity
 * once. Includes the KeyDescriptor with no key (we rely on TLS), the
 * ACS endpoint, and the NameIDFormat.
 */
export function buildMetadataXml(input: {
  entityId: string;
  acsUrl: string;
  name: string;
}): string {
  return (
    `<?xml version="1.0"?>\n` +
    `<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" ` +
    `entityID="${xmlEscape(input.entityId)}">` +
    `<SPSSODescriptor AuthnRequestsSigned="false" ` +
    `WantAssertionsSigned="false" ` +
    `protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">` +
    `<NameIDFormat>${DEFAULT_NAME_FORMAT}</NameIDFormat>` +
    `<SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" ` +
    `Location="${xmlEscape(input.acsUrl)}"/>` +
    `<SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" ` +
    `Location="${xmlEscape(input.acsUrl)}"/>` +
    `</SPSSODescriptor>` +
    `<Organization>` +
    `<OrganizationName xml:lang="en-US">${xmlEscape(input.name)}</OrganizationName>` +
    `</Organization>` +
    `</EntityDescriptor>`
  );
}

/**
 * Decode the SAML Response body from the IdP. Accepts either base64
 * (HTTP-POST binding) or raw XML (some IdPs send the raw body).
 *
 * Returns the extracted Assertion details: NameID, attributes, plus
 * the optional NotOnOrAfter timestamp on the assertion.
 */
export function parseSamlResponse(raw: string): {
  assertion: {
    nameId: string;
    attributes: Record<string, string | undefined>;
    notOnOrAfter: number | null;
    sessionIndex: string | null;
  };
  xml: string;
} {
  const xml = decodeResponse(raw);
  const assertionBlock =
    matchFirst(/<saml:Assertion[\s\S]*?<\/saml:Assertion>|<saml:Assertion\s*\/>/, xml) ??
    matchFirst(/<Assertion[\s\S]*?<\/Assertion>|<Assertion\s*\/>/, xml);
  if (!assertionBlock) {
    throw new Error('SAML Response missing Assertion');
  }
  const subjectBlock =
    matchFirst(/<saml:Subject[\s\S]*?<\/saml:Subject>|<saml:Subject\s*\/>/, assertionBlock) ??
    matchFirst(/<Subject[\s\S]*?<\/Subject>|<Subject\s*\/>/, assertionBlock);
  if (!subjectBlock) throw new Error('SAML Assertion missing Subject');
  const nameId = matchFirst(
    /<saml:NameID[^>]*>([\s\S]*?)<\/saml:NameID>|<NameID[^>]*>([\s\S]*?)<\/NameID>/,
    subjectBlock
  );
  if (!nameId) throw new Error('SAML Assertion missing NameID');
  const conditions = matchFirst(
    /<saml:Conditions[\s\S]*?(?:<\/saml:Conditions>|\s*\/>)|<Conditions[\s\S]*?(?:<\/Conditions>|\s*\/>)/,
    assertionBlock
  );
  const notOnOrAfter = conditions ? matchFirst(/NotOnOrAfter="([^"]+)"/, conditions) : null;
  const sessionIndex = matchFirst(/SessionIndex="([^"]+)"/, assertionBlock) ?? null;
  const attributes = extractAttributes(assertionBlock);
  return {
    assertion: {
      nameId: nameId.trim(),
      attributes,
      notOnOrAfter: notOnOrAfter ? Date.parse(notOnOrAfter) : null,
      sessionIndex,
    },
    xml,
  };
}

/** Pick the most likely email attribute; falls back to NameID. */
export function extractEmailFromAssertion(input: {
  nameId: string;
  attributes: Record<string, string | undefined>;
}): string {
  const a = input.attributes;
  return (
    a['email'] ??
    a['mail'] ??
    a['Email'] ??
    a['urn:oid:0.9.2342.19200300.100.1.3'] ??
    a['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ??
    input.nameId
  );
}

export function extractDisplayName(input: { attributes: Record<string, string | undefined> }): {
  givenName?: string;
  surname?: string;
} {
  const a = input.attributes;
  return {
    givenName: a['givenName'] ?? a['given_name'] ?? a['FirstName'] ?? a['cn'],
    surname: a['surname'] ?? a['family_name'] ?? a['LastName'],
  };
}

// --- internals ---

function decodeResponse(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) return trimmed;
  const buf = Buffer.from(trimmed, 'base64');
  // Some IdPs gzip instead of base64; some do both. Try gunzip, fall back to raw.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const zlib = require('zlib') as typeof import('zlib');
    return zlib.gunzipSync(buf).toString('utf-8');
  } catch {
    return buf.toString('utf-8');
  }
}

function extractAttributes(assertionXml: string): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  const re =
    /<saml:Attribute[^>]+Name="([^"]+)"[\s\S]*?<saml:AttributeValue[^>]*>([\s\S]*?)<\/saml:AttributeValue>|<Attribute[^>]+Name="([^"]+)"[\s\S]*?<AttributeValue[^>]*>([\s\S]*?)<\/AttributeValue>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(assertionXml)) !== null) {
    const name = (m[1] ?? m[3]).trim();
    const value = (m[2] ?? m[4]).trim();
    out[name] = value;
  }
  return out;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Capture the first regex match into group 1 OR group 2 (we sometimes
 * alternate between `saml:` prefixed and bare tag names for forward
 * compatibility with non-strict IdPs). Falls back to the full match
 * (`m[0]`) for whole-pattern regexes that capture no group.
 */
function matchFirst(re: RegExp, s: string): string | null {
  re.lastIndex = 0;
  const m = re.exec(s);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[0] ?? null;
}

/** Stable opaque handle for an AuthnRequest — used to dedupe replays. */
export function hashAuthnRequest(xml: string): string {
  return createHash('sha256').update(xml).digest('hex').slice(0, 32);
}

/** Deflate an already-encoded SAMLRequest (used in tests + tooling). */
export function deflateSamlRequest(encoded: string): Buffer {
  return inflateSync(Buffer.from(encoded, 'base64'));
}
