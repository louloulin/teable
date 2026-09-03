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
  /** Optional provider-specific message kind. Defaults to `text`. */
  kind?: 'text' | 'image' | 'file' | 'post';
  /** Feishu image key for `kind=image`. */
  imageKey?: string;
  /** Feishu file key for `kind=file`. */
  fileKey?: string;
  /** Optional source URL; Feishu automation may upload it before sending. */
  imageUrl?: string;
  fileUrl?: string;
  fileName?: string;
  /** Provider-native rich content, used by Feishu `kind=post`. */
  providerPayload?: Record<string, unknown>;
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
