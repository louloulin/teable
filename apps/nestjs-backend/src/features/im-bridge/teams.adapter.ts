import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import type { IBridgeAdapter, IBridgeMessage } from './im-bridge.types';

/**
 * Microsoft Teams adapter using the Incoming Webhook (MessageCard) API.
 *
 * Wire format reference:
 *   https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook
 *
 * Each channel has a unique connector URL issued from the Teams UI. The
 * adapter stores no secrets beyond that URL — the connector URL itself is
 * the secret, encrypted at rest in the `setting` row.
 */
@Injectable()
export class TeamsAdapter implements IBridgeAdapter {
  readonly type = 'teams';

  constructor(private readonly http: HttpService) {}

  validateConfig(config: Record<string, unknown>): { ok: boolean; error?: string } {
    const url = config.webhookUrl;
    if (typeof url !== 'string' || url.length === 0) {
      return { ok: false, error: 'webhookUrl is required' };
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: 'webhookUrl is not a valid URL' };
    }
    if (parsed.protocol !== 'https:') {
      return { ok: false, error: 'webhookUrl must use https' };
    }
    // Connector URLs are issued by outlook.office.com (legacy) or
    // webhook.office.com (modern). Anything else is almost certainly a
    // configuration error or a malicious input pasted into the form.
    const host = parsed.hostname.toLowerCase();
    const allowed =
      host === 'webhook.office.com' ||
      host === 'outlook.office.com' ||
      host.endsWith('.webhook.office.com') ||
      host.endsWith('.outlook.office.com');
    if (!allowed) {
      return { ok: false, error: 'webhookUrl must be a Teams office.com domain' };
    }
    return { ok: true };
  }

  /**
   * Build a MessageCard payload and POST it to the connector URL.
   *
   * Returns `{ delivered: true, status }` on a 2xx response; any other
   * status (including network errors) is surfaced as `{ delivered: false, error }`
   * so the bridge service can record a structured run-history failure.
   */
  async sendMessage(
    config: Record<string, unknown>,
    message: IBridgeMessage
  ): Promise<{ delivered: true; status: number } | { delivered: false; error: string }> {
    const validation = this.validateConfig(config);
    if (!validation.ok) {
      return { delivered: false, error: validation.error ?? 'invalid config' };
    }
    const webhookUrl = config.webhookUrl as string;
    const summary = message.title ?? message.text;
    const sections = message.fields && message.fields.length > 0
      ? [
          {
            facts: message.fields.map((f) => ({ name: f.name, value: f.value })),
          },
        ]
      : undefined;
    const payload = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary,
      themeColor: '0072C6',
      title: message.title,
      text: message.text,
      ...(sections ? { sections } : {}),
    };
    try {
      const response = await firstValueFrom(
        this.http.post(webhookUrl, payload, {
          headers: { 'content-type': 'application/json' },
          // Connector URLs respond with a tiny 1-byte body; do not throw on 4xx
          // other than what fetch does naturally.
          validateStatus: (status) => status >= 200 && status < 300,
          // Disable axios' default throw — we inspect `response.status` ourselves
          // to capture a useful error message.
          transformResponse: (d) => d,
        })
      );
      return { delivered: true, status: response.status };
    } catch (e) {
      const status =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e as any)?.response?.status as number | undefined;
      const text =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((e as any)?.response?.data as string | undefined) ?? '';
      const error = status
        ? `teams HTTP ${status}${text ? `: ${text.slice(0, 200)}` : ''}`
        : e instanceof Error
          ? e.message
          : String(e);
      return { delivered: false, error };
    }
  }
}
