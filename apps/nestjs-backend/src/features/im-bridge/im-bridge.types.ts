/**
 * IM bridge adapter contract.
 *
 * Each integration target (Slack, Discord, Telegram, Microsoft Teams, …) is a
 * separate adapter implementing `IBridgeAdapter`. The bridge service resolves
 * the adapter for an `IMProvider` and dispatches the message through it.
 *
 * The base `IBridgeAdapter` is intentionally transport-agnostic — adapters
 * own the wire format, authentication, and provider-specific quirks. The
 * bridge service is responsible for credential resolution, error
 * normalisation, and run-history bookkeeping.
 */

export interface IBridgeMessage {
  /** Required message body. */
  text: string;
  /** Optional subject line (used by Teams MessageCard.title, email subject). */
  title?: string;
  /** Optional structured key/value pairs (rendered as sections.facts in Teams). */
  fields?: Array<{ name: string; value: string }>;
}

export interface IBridgeAdapter {
  /** Stable identifier matched against `IMProvider` (e.g. 'slack', 'teams'). */
  readonly type: string;
  /**
   * Validate a stored config blob. Must throw (or return `{ ok: false, error }`)
   * on invalid input — the controller surfaces the error to the admin UI.
   */
  validateConfig(config: Record<string, unknown>): { ok: boolean; error?: string };
  /**
   * Send a message through the adapter. Implementations resolve any
   * transport-level details (URL, headers, body shape) and throw on
   * non-2xx HTTP status so the bridge service can mark the run failed.
   */
  sendMessage(
    config: Record<string, unknown>,
    message: IBridgeMessage
  ): Promise<{ delivered: true; status: number } | { delivered: false; error: string }>;
}
