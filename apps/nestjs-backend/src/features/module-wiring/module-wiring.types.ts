/**
 * Module wiring — types (Stage 90).
 */

export type FeatureModule =
  | 'risk-policy-engine'
  | 'login-risk-anomaly'
  | 'org-ban-allow-list'
  | 'quota-anomaly-alert'
  | 'risk-event-query-dsl'
  | 'seat-metering'
  | 'storage-metering'
  | 'license-key-self'
  | 'stripe-webhook'
  | 'billing-pdf-export'
  | 'field-type-map'
  | 'conversion-pipeline'
  | 'conflict-replay'
  | 'scheduled-import'
  | 'data-exchange-audit';

export interface IModuleEntry {
  /** Feature module name. */
  name: FeatureModule;
  /** Whether the module's auth.service is registered in the global container. */
  registered: boolean;
  /** Whether the module has a controller scaffold. */
  hasController: boolean;
  /** Whether a guard / interceptor covers the module's routes. */
  guarded: boolean;
}

export interface IWiringManifest {
  generatedAt: string;
  entries: IModuleEntry[];
  /** Modules with any entry marked `registered: false`. */
  missing: FeatureModule[];
}

export const FEATURE_MODULE_NAMES: ReadonlyArray<FeatureModule> = [
  'risk-policy-engine',
  'login-risk-anomaly',
  'org-ban-allow-list',
  'quota-anomaly-alert',
  'risk-event-query-dsl',
  'seat-metering',
  'storage-metering',
  'license-key-self',
  'stripe-webhook',
  'billing-pdf-export',
  'field-type-map',
  'conversion-pipeline',
  'conflict-replay',
  'scheduled-import',
  'data-exchange-audit',
];

export const MAX_MODULES = 128;
