import { Injectable, Logger } from '@nestjs/common';
import type {
  GenericAdapterInfo,
  GenericConnectionProbe,
  GenericFetchResult,
  GenericSourceSpec,
} from './generic-connector.types';
import {
  getAdapter,
  listAdapterInfos,
  listAdapterTypes,
  registerAdapter,
} from './generic-connector.adapters';

/**
 * Round-23: Generic Connector service. Acts as the driver boundary for
 * arbitrary source specs — unlike source-specific drivers (baserow/clickup/
 * jira/monday/nocodb/smartsheet/smartsuite), this one routes through a
 * registry of pluggable adapters.
 *
 * Provides:
 *   1. Probe — list registered adapters + their types
 *   2. listAdapters — return adapter metadata (builtin + custom)
 *   3. registerAdapter — add a new adapter at runtime (REST POST body)
 *   4. fetch — dispatch a GenericSourceSpec to its registered adapter
 */
@Injectable()
export class GenericConnectorService {
  private readonly logger = new Logger(GenericConnectorService.name);

  probe(): GenericConnectionProbe {
    const types = listAdapterTypes();
    return {
      ok: true,
      adapterCount: types.length,
      builtinTypes: types,
      fetchedAt: new Date().toISOString(),
    };
  }

  listAdapters(): { total: number; adapters: GenericAdapterInfo[] } {
    return { total: listAdapterTypes().length, adapters: listAdapterInfos() };
  }

  /** Runtime registration — accepts arbitrary adapter fn expressed as code+language marker. */
  register(args: {
    type: string;
    description?: string;
    displayName?: string;
  }): { ok: boolean; type: string; registered: boolean; error?: string } {
    const t = args.type?.trim();
    if (!t || !/^[a-z][a-z0-9-]{1,31}$/.test(t)) {
      return { ok: false, type: t ?? '', registered: false, error: 'invalid type (must match /^[a-z][a-z0-9-]{1,31}$/)' };
    }
    // Built-in adapters cannot be overwritten via runtime API.
    const existing = getAdapter(t);
    if (existing && listAdapterInfos().find((a) => a.type === t)?.builtin) {
      return { ok: true, type: t, registered: false, error: 'builtin adapter cannot be overridden' };
    }
    // Round-23 minimal: accept registration record, mark as placeholder until
    // an actual adapter fn is provided via the registry's internal API.
    // This endpoint exists for pluggability surface parity; the actual
    // adapter function is uploaded via a future admin UI.
    registerAdapter(t, async () => ({ ok: false, error: 'placeholder', fetchedAt: new Date().toISOString() } as GenericFetchResult), {
      displayName: args.displayName,
      description: args.description,
    });
    this.logger.log(`registered generic adapter type=${t}`);
    return { ok: true, type: t, registered: true };
  }

  async fetch(spec: GenericSourceSpec): Promise<GenericFetchResult> {
    const fn = getAdapter(spec.adapterType);
    if (!fn) {
      return {
        ok: false,
        adapterType: spec.adapterType,
        endpoint: spec.endpoint,
        error: `adapter type not registered: ${spec.adapterType}`,
        fetchedAt: new Date().toISOString(),
      };
    }
    return fn(spec);
  }
}
