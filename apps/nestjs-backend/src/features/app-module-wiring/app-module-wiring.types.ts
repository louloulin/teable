/**
 * App module wiring — types (Stage 95).
 */

export type WireCategory = 'core' | 'infra' | 'feature';

export interface IModuleWire {
  /** Module id — matches NestJS module class name. */
  name: string;
  /** Category for ordering. */
  category: WireCategory;
  /** Round it shipped in. */
  round: number;
  /** Whether this module is required by hard deps. */
  required: boolean;
}

export interface IWiringManifest {
  modules: IModuleWire[];
}

export const STAGES_90_TO_94_MODULES: ReadonlyArray<IModuleWire> = [
  { name: 'ModuleWiringModule', category: 'feature', round: 18, required: true },
  { name: 'ControllerFactoryModule', category: 'feature', round: 18, required: false },
  { name: 'InterceptorGuardModule', category: 'infra', round: 18, required: false },
  { name: 'OpenApiMetadataModule', category: 'infra', round: 18, required: false },
  { name: 'E2ETestUtilsModule', category: 'infra', round: 18, required: false },
];

export const MAX_MODULES = 128;