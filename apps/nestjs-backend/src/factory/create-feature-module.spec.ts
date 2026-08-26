/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * R1-T04 — `createFeatureModule` factory specs.
 *
 * Four forms must be covered (acceptance T04-V02):
 *
 *   (A) service-only module
 *   (B) service + controller module
 *   (C) module with `guards` metadata + `querySchema`
 *   (D) global module (with `global: true`)
 *
 * We do NOT spin up a real `NestFactory.create(AppModule)` here — the
 * goal of these specs is to validate that the descriptor NestJS sees
 * has the right `providers / controllers / exports / global` shape, so
 * a flat-object assertion is enough. The behavioural integration test
 * is `apps/nestjs-backend/test/r1-t03-audit-frontend-bridge.e2e-spec.ts`,
 * which boots the audit module that uses this factory.
 */

import type { CanActivate } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { z } from 'zod';

import {
  META_BODY,
  META_GUARDS,
  META_QUERY,
  clearFeatureModuleRegistry,
  createFeatureModule,
} from './create-feature-module';

class ProbeService {
  ping(): string {
    return 'pong';
  }
}

class ProbeController {
  probe(): string {
    return 'controller-mounted';
  }
}

class ProbeGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

describe('createFeatureModule (R1-T04)', () => {
  beforeEach(() => {
    clearFeatureModuleRegistry();
  });

  it('form A — service-only module wires providers + exports', () => {
    const feature = createFeatureModule({
      name: 'service-only',
      service: ProbeService,
    });

    expect(feature.module.providers).toContain(ProbeService);
    expect(feature.module.exports).toEqual([ProbeService]);
    expect(feature.module.controllers).toBeUndefined();
    expect(feature.module.global).toBe(false);
    expect(feature.tokens.service).toBe(ProbeService);
    expect(feature.tokens.controller).toBeUndefined();
  });

  it('form B — service + controller registers the controller', () => {
    const feature = createFeatureModule({
      name: 'with-controller',
      service: ProbeService,
      controller: ProbeController,
    });

    expect(feature.module.controllers).toEqual([ProbeController]);
    expect(feature.module.providers).toContain(ProbeService);
    expect(feature.module.exports).toEqual([ProbeService]);
    expect(feature.tokens.controller).toBe(ProbeController);
  });

  it('form C — querySchema + guards metadata + extra providers', () => {
    const querySchema = z.object({ limit: z.coerce.number().int().min(1).optional() });
    const bodySchema = z.object({ name: z.string().min(1) });

    const feature = createFeatureModule({
      name: 'with-guards',
      service: ProbeService,
      controller: ProbeController,
      querySchema,
      bodySchema,
      guards: [ProbeGuard],
      providers: [{ provide: 'EXTRA', useValue: 'extra-value' }],
      exportedProviders: [ProbeService, { provide: 'EXTRA', useValue: 'extra-value' }],
    });

    expect(feature.module.providers).toEqual(
      expect.arrayContaining([ProbeService, { provide: 'EXTRA', useValue: 'extra-value' }])
    );
    expect(feature.module.controllers).toEqual([ProbeController]);
    expect(feature.module.exports).toEqual([
      ProbeService,
      { provide: 'EXTRA', useValue: 'extra-value' },
    ]);
    expect(feature.module.global).toBe(false);

    // The metadata providers should be present so consumers can fetch
    // them via `ModuleRef.get(META_QUERY)` etc.
    expect(feature.module.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: META_QUERY, useValue: querySchema }),
        expect.objectContaining({ provide: META_BODY, useValue: bodySchema }),
        expect.objectContaining({ provide: META_GUARDS, useValue: [ProbeGuard] }),
      ])
    );
  });

  it('form D — global module sets the `global` flag', () => {
    const feature = createFeatureModule({
      name: 'global-feature',
      service: ProbeService,
      global: true,
    });

    expect(feature.module.global).toBe(true);
    expect(feature.module.providers).toContain(ProbeService);
  });

  it('rejects non-zod querySchema with a clear error', () => {
    expect(() =>
      createFeatureModule({
        name: 'bad-query',
        service: ProbeService,
        // Intentional wrong type — pretend `{}` is a zod schema.
        querySchema: {} as unknown as z.ZodTypeAny,
      })
    ).toThrow(/querySchema must be a zod schema/);
  });

  it('rejects non-zod bodySchema with a clear error', () => {
    expect(() =>
      createFeatureModule({
        name: 'bad-body',
        service: ProbeService,
        bodySchema: 'not-a-schema' as unknown as z.ZodTypeAny,
      })
    ).toThrow(/bodySchema must be a zod schema/);
  });

  it('boots a TestModule that resolves the service — proves the descriptor is Nest-valid', async () => {
    const feature = createFeatureModule({
      name: 'boots',
      service: ProbeService,
    });

    const mod = await Test.createTestingModule({
      imports: [feature.module],
    }).compile();

    const svc = mod.get(ProbeService);
    expect(svc.ping()).toBe('pong');
    await mod.close();
  });
});
