export * from './api-explorer';
export * from './setting';
export * from './template';
export * from './scim';
export * from './audit';
export * from './operations';
export * from './operations/AdminUsersPage';
export * from './operations/AdminSpacesPage';
export * from './computed-outbox';
export * from './table-query-ops';
export * from './ai-generation-queue';
export { NotionPanel } from './notion/NotionPanel';
export * from './webhook';
export * from './google-sheets';
export * from './im-bridge';
export * from './skills';
export * from './data-db';
export * from './announcements';
export * from './sandbox-agent';
export * from './byok';
export * from './custom-ai-model';
export * from './billing';

export { SsoAdminPanel } from './sso-panel';
export { SamlAdminPanel } from './saml-panel';
export { TotpAdminPanel } from './totp-admin-panel';
export { QuotaAdminPanel } from './quota-panel';
export { AiCostAdminPanel } from './ai-cost-panel';
export { AirtableAdminPanel } from './airtable-panel';

// Enterprise-capability placeholder pages — bridge the OSS/Cloud gap so the
// admin nav always resolves a real page even when the dedicated UI is not
// shipped yet. Each page renders an honest description + the OSS backend
// route that operators can target with curl.
export {
  EnterprisePlaceholderPage,
  type IEnterprisePlaceholderPageProps,
} from './enterprise-placeholder';
