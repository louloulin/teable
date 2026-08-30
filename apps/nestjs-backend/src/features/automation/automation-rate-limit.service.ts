import { Injectable } from '@nestjs/common';

export type AutomationRateLimitKind = 'email' | 'webhook';

interface IBucket {
  windowStart: number;
  count: number;
}

const WINDOW_MS = 1000;
const EMAIL_PER_BASE = 5;
const WEBHOOK_PER_BASE = 50;
const WEBHOOK_PER_AUTOMATION = 2;

@Injectable()
export class AutomationRateLimitService {
  private readonly buckets = new Map<string, IBucket>();

  consume(baseId: string, automationId: string, kind: AutomationRateLimitKind): boolean {
    const scopes =
      kind === 'webhook'
        ? [
            [`${kind}:base:${baseId}`, WEBHOOK_PER_BASE],
            [`${kind}:automation:${automationId}`, WEBHOOK_PER_AUTOMATION],
          ]
        : [[`${kind}:base:${baseId}`, EMAIL_PER_BASE]];

    const now = Date.now();
    const next = scopes.map(([key, limit]) => ({
      key: String(key),
      limit: Number(limit),
      bucket: this.buckets.get(String(key)),
    }));

    if (
      next.some(({ bucket, limit }) => {
        if (!bucket || now - bucket.windowStart >= WINDOW_MS) return false;
        return bucket.count >= limit;
      })
    ) {
      return false;
    }

    for (const { key, bucket } of next) {
      if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
        this.buckets.set(key, { windowStart: now, count: 1 });
      } else {
        bucket.count += 1;
      }
    }
    return true;
  }

  reset(): void {
    this.buckets.clear();
  }
}
