/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * R1-T04 — `createFeatureModule` factory.
 *
 * Tiny helper that turns the recurring "controller + service + module + zod
 * schema" four-piece pattern into a single call. Designed for thin-DI
 * wrappers (Stage N + R1-T02), but works for any service shape:
 *
 * ```ts
 * const { AuditModule } = createFeatureModule({
 *   name: 'audit',
 *   service: AuditAuthService,
 *   controller: AuditAdminController,
 *   guards: [LicenseCapabilityGuard.for('audit_log')],
 * });
 * ```
 *
 * The factory never replaces `@Injectable()` / `@Controller()` /
 * `@UseGuards()` decorators — NestJS still needs the reflect-metadata
 * those produce. It only generates the `DynamicModule` descriptor, so
 * caller files look like a one-liner instead of repeating boilerplate.
 *
 * Design rules:
 *   - Zero new npm deps (uses `@nestjs/common` + `zod` already in tree).
 *   - Zero hot-path change: existing modules are untouched. This factory
 *     is *new infrastructure*; only `audit.module.ts` is rewired as a
 *     call-site proof.
 *   - Type-safe: generics carry service & controller types through, so
 *     consumers keep `Inject<typeof X>` semantics.
 *   - Backward-compatible optional fields: `controller / querySchema /
 *     bodySchema / guards / exportedProviders / global` all default.
 */

import type { CanActivate, DynamicModule, Provider, Type } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';

/** Minimal structural type for a NestJS-injectable service class.
 *  We accept any constructor signature because NestJS's `@Injectable()`
 *  decorator doesn't constrain the parameter list. */
export type InjectableClass<T = unknown> = new (...args: never[]) => T;

/** Optional descriptor passed to `createFeatureModule`. */
export interface CreateFeatureModuleOptions<
  TService extends InjectableClass,
  TController extends InjectableClass | undefined,
  TQuery extends ZodTypeAny | undefined,
  TBody extends ZodTypeAny | undefined,
> {
  /** Logical name (used in debug logs / DI token collisions if any). */
  name: string;

  /** Service class — required; becomes the module's primary provider. */
  service: TService;

  /**
   * Optional controller class. If provided, the controller is wired
   * via `controllers:` so NestJS auto-mounts its routes. Leave
   * `undefined` for service-only modules (e.g. read-only auth surfaces
   * that are consumed via `Module.imports` from elsewhere).
   */
  controller?: TController;

  /**
   * Optional zod schema describing the GET query shape. Stored on the
   * returned module metadata via a custom `META_QUERY` token so the
   * controller (or its callers) can fetch it without importing the
   * schema directly. Used by the audit admin controller's
   * `ZodValidationPipe`. The factory does NOT auto-wire the pipe —
   * it only records the schema for the controller to pick up.
   */
  querySchema?: TQuery;

  /** Optional zod schema for POST/PATCH bodies. Same convention as
   *  `querySchema`. */
  bodySchema?: TBody;

  /**
   * Optional guard classes (admin gating, license capability, etc.).
   * Stored on the module metadata via a custom `META_GUARDS` token so
   * the controller (or its callers) can apply them via
   * `@UseGuards(...guards)`. The factory does NOT auto-apply them.
   */
  guards?: Type<CanActivate>[];

  /** Extra providers to register alongside `service`. */
  providers?: Provider[];

  /** Providers to export from the module. Defaults to `[service]`. */
  exportedProviders?: Provider[];

  /** Mark the module global so consumers don't need to import it. */
  global?: boolean;
}

/**
 * Module metadata token names. The factory publishes these as module
 * providers so callers can fetch them via `@Inject(META_QUERY)` etc.
 * Exported as constants to keep the metadata contract inspectable.
 */
export const META_QUERY = Symbol.for('@teable/factory#querySchema');
export const META_BODY = Symbol.for('@teable/factory#bodySchema');
export const META_GUARDS = Symbol.for('@teable/factory#guards');

/** Returned by `createFeatureModule` — a NestJS-compatible module
 *  descriptor (without NestJS-prohibited keys like `module` / `global`)
 *  plus the resolved type tokens of the service / controller (so
 *  consumers can write `ModuleRef.get(FeatureModule.tokens.service)`). */
export interface ResolvedFeatureModule<
  TService extends InjectableClass,
  TController extends InjectableClass | undefined,
> {
  /** NestJS-compatible dynamic module descriptor. `module` points to
   *  the generated `ModuleClass`; `global` reflects the option passed
   *  in (encoded via `@Global()` on the class itself). */
  module: DynamicModule;

  /** Type tokens for the service / controller — purely for callers. */
  tokens: {
    service: TService;
    controller: TController;
  };

  /** Module class — usable as `imports: [AuditModule]` in AppModule. */
  Module: Type<unknown>;
}

const moduleClassRegistry = new Map<string, Type<unknown>>();

/** Build a `DynamicModule` for a thin-DI feature. */
export function createFeatureModule<
  TService extends InjectableClass,
  TController extends InjectableClass | undefined = undefined,
  TQuery extends ZodTypeAny | undefined = undefined,
  TBody extends ZodTypeAny | undefined = undefined,
>(
  options: CreateFeatureModuleOptions<TService, TController, TQuery, TBody>
): ResolvedFeatureModule<TService, TController> {
  const {
    service,
    controller,
    querySchema,
    bodySchema,
    guards,
    providers = [],
    exportedProviders,
    global = false,
  } = options;

  // Validate the schema pair — zod types only. If a caller passes
  // `querySchema: someZodObject`, we record it on the module so the
  // controller can pull it via `ModuleRef.get(META_QUERY)`.
  if (querySchema !== undefined && (querySchema as { _def?: unknown })._def === undefined) {
    throw new TypeError(
      `[createFeatureModule] "${options.name}" — querySchema must be a zod schema (received ${typeof querySchema})`
    );
  }
  if (bodySchema !== undefined && (bodySchema as { _def?: unknown })._def === undefined) {
    throw new TypeError(
      `[createFeatureModule] "${options.name}" — bodySchema must be a zod schema (received ${typeof bodySchema})`
    );
  }

  const metadataProviders: Provider[] = [];
  if (querySchema !== undefined) {
    metadataProviders.push({ provide: META_QUERY, useValue: querySchema });
  }
  if (bodySchema !== undefined) {
    metadataProviders.push({ provide: META_BODY, useValue: bodySchema });
  }
  if (guards !== undefined && guards.length > 0) {
    metadataProviders.push({ provide: META_GUARDS, useValue: guards });
  }

  // Build the config we hand to `@Module({...})`. NestJS validates the
  // keys; only `providers / controllers / exports / imports` are
  // accepted, so we must strip `module` (it is auto-attached by the
  // decorator at runtime) and `global` (encoded via `@Global()`).
  const moduleConfig: Omit<DynamicModule, 'module' | 'global'> = {
    providers: [service, ...metadataProviders, ...providers],
    exports: exportedProviders ?? [service],
    ...(controller !== undefined ? { controllers: [controller] } : {}),
  };

  // Decorate a fresh module class. When `global: true`, stack
  // `@Global()` on top of `@Module()` so the resulting module is
  // available without explicit imports.
  const ModuleClass = createFeatureModuleClass(options.name, moduleConfig, global);
  moduleClassRegistry.set(options.name, ModuleClass);

  // Re-attach `module` + `global` for callers that inspect the
  // descriptor (tests, debug tools). NestJS itself reads these from
  // the decorated class.
  const descriptor: DynamicModule = {
    ...moduleConfig,
    module: ModuleClass,
    global,
  };

  return {
    module: descriptor,
    tokens: {
      // The structural type is erased; consumers can still re-import
      // the original class. This cast is purely a type-space alias.
      service: service as TService,
      controller: controller as TController,
    },
    Module: ModuleClass,
  };
}

/** Internal — generate a unique `@Module()`-decorated class for a
 *  feature name. Uses a counter to keep class identities distinct so
 *  `Test.createTestingModule({ imports: [M1, M2] })` does not collide.
 *  When `global` is true, `@Global()` is applied on top of `@Module()`. */
let featureModuleSeq = 0;
function createFeatureModuleClass(
  name: string,
  config: Omit<DynamicModule, 'module' | 'global'>,
  global: boolean
): Type<unknown> {
  featureModuleSeq += 1;
  const className = `FeatureModule__${sanitizeName(name)}__${featureModuleSeq}`;
  // The host class identity must stay stable across the decorator
  // applications — both `@Module()` and `@Global()` mutate the same
  // constructor via reflect-metadata rather than returning a new one.
  class AnonymousHost {
    // Placeholder — the decorators will mutate this constructor.
  }
  const Host = AnonymousHost as unknown as Type<unknown> & Function;
  if (global) {
    Global()(Host);
  }
  Module(config as Parameters<typeof Module>[0])(Host);
  // Re-export the decorated host under the requested class name so
  // debug logs / DI error messages read as `FeatureModule__audit__1`.
  Object.defineProperty(Host, 'name', { value: className });
  return Host;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/** Internal helper — get a previously-registered feature module by name.
 *  Mainly for tests that want to inspect the registry. */
export function getRegisteredFeatureModule(name: string): Type<unknown> | undefined {
  return moduleClassRegistry.get(name);
}

/** Clear the registry. Exposed so test setups can isolate runs. */
export function clearFeatureModuleRegistry(): void {
  moduleClassRegistry.clear();
  featureModuleSeq = 0;
}
