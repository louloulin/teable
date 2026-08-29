/**
 * Webhook delivery admin OpenAPI route (Wave 10 / T-13).
 *
 * Mirrors the backend admin controller:
 *   - `POST /admin/webhook/delivery/:id/retry`
 *
 * The frontend uses the typed client (`retryWebhookDelivery`) to call
 * the dead-letter "重新投递" / "Retry" button on the admin panel.
 *
 * The route shape is intentionally minimal: callers only need the new
 * `attemptId` so the panel can toast the id of the freshly-queued
 * attempt. Errors are surfaced through the global axios error path.
 */
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { axios } from '../../axios';
import { registerRoute, urlBuilder } from '../../utils';

export const RETRY_WEBHOOK_DELIVERY = '/admin/webhook/delivery/{id}/retry';

/** Path params for the retry route — kept loose so we can swap the id
 * validator without breaking the openapi descriptor. */
export const retryWebhookDeliveryRouteParamsSchema = z.object({
  id: z.string().uuid(),
});

export type IRetryWebhookDeliveryParams = z.infer<typeof retryWebhookDeliveryRouteParamsSchema>;

/** Response VO — `{ retried, attemptId }` matching
 * `WebhookDeliveryAuthService.retry()`'s return shape. */
export const retryWebhookDeliveryVoSchema = z.object({
  retried: z.boolean(),
  attemptId: z.string(),
});

export type IRetryWebhookDeliveryVo = z.infer<typeof retryWebhookDeliveryVoSchema>;

export const RetryWebhookDeliveryRoute: RouteConfig = registerRoute({
  method: 'post',
  path: RETRY_WEBHOOK_DELIVERY,
  description: 'Re-queue a dead-letter webhook delivery by creating a fresh attempt row.',
  request: {
    params: retryWebhookDeliveryRouteParamsSchema,
  },
  responses: {
    200: {
      description: 'Dead-letter delivery retried. Returns the id of the new attempt row.',
      content: {
        'application/json': {
          schema: retryWebhookDeliveryVoSchema,
        },
      },
    },
    400: {
      description: 'The delivery exists but is not in dead-letter status.',
    },
    404: {
      description: 'No delivery with the given id.',
    },
  },
  tags: ['admin'],
});

/**
 * POST /admin/webhook/delivery/:id/retry
 *
 * The original dead-letter row is preserved (status stays `dead`) and a
 * new row is created with `attempt=0` so the dispatcher treats it as a
 * brand-new run.
 */
export const retryWebhookDelivery = async (id: string) => {
  return axios.post<IRetryWebhookDeliveryVo>(
    urlBuilder(RETRY_WEBHOOK_DELIVERY, { id })
  );
};
