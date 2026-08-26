import type { IBridgeAdapter } from './im-bridge.types';

/**
 * Adapter registry for the IM bridge.
 *
 * Each transport (Slack, Discord, Telegram, Microsoft Teams, …) registers
 * itself under its stable `type` string. The bridge dispatcher
 * (`IMBridgeService`) resolves the right adapter for an
 * `AutomationActionType` through this map, so adding a new transport
 * is purely additive — existing adapter bodies are not touched.
 *
 * The map is intentionally a plain `Record`, not a Nest provider map.
 * Adapters that need DI (e.g. `TeamsAdapter` for `HttpService`) are
 * instantiated in `ImBridgeModule` and registered here at construction
 * time. Pure stateless adapters could be registered as values directly,
 * but for now we keep one shape (constructor-injected instances) so
 * every adapter can participate in the same module-level wiring.
 */
export type IBridgeAdapterRegistry = Readonly<Record<string, IBridgeAdapter>>;

export const buildAdapterRegistry = (entries: IBridgeAdapter[]): IBridgeAdapterRegistry => {
  const map: Record<string, IBridgeAdapter> = {};
  for (const adapter of entries) {
    if (map[adapter.type]) {
      throw new Error(`duplicate adapter registration for type=${adapter.type}`);
    }
    map[adapter.type] = adapter;
  }
  return Object.freeze(map);
};

export const resolveAdapter = (
  registry: IBridgeAdapterRegistry,
  type: string
): IBridgeAdapter | undefined => registry[type];
