/**
 * Webhook delivery admin OpenAPI route (Wave 10 / T-13).
 *
 * Lists the dead-letter rows the panel renders.
 *
 *   GET /admin/webhook/delivery/dead-letter
 *
 * The backend may not yet have a controller for this exact listing —
 * the panel calls a best-effort helper here and degrades to an empty
 * table when the endpoint is absent. Keeping the schema in the openapi
 * package means the panel can be wired against a contract instead of
 * a hand-rolled shape.
 */
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { axios } from '../../axios';
import { registerRoute } from '../../utils';

export const LIST_DEAD_LETTER_WEBHOOK_DELIVERIES =
  '/admin/webhook/delivery/dead-letter';

export const deadLetterWebhookDeliveryVoSchema = z.object({
  id: z.string(),
  endpointId: z.string(),
  payloadId: z.string(),
  status: z.string(),
  attempt: z.number(),
  maxAttempts: z.number(),
  lastStatusCode: z.number().optional(),
  lastError: z.string().optional(),
  finalizedAt: z.string().optional(),
  createdTime: z.string(),
});

export type IDeadLetterWebhookDeliveryVo = z.infer<
  typeof deadLetterWebhookDeliveryVoSchema
>;

export const listDeadLetterWebhookDeliveriesVoSchema = z.object({
  rows: z.array(deadLetterWebhookDeliveryVoSchema),
  total: z.number(),
});

export type IListDeadLetterWebhookDeliveriesVo = z.infer<
  typeof listDeadLetterWebhookDeliveriesVoSchema
>;

export const ListDeadLetterWebhookDeliveriesRoute: RouteConfig = registerRoute({
  method: 'get',
  path: LIST_DEAD_LETTER_WEBHOOK_DELIVERIES,
  description: 'List webhook deliveries that ended in dead-letter status.',
  request: {},
  responses: {
    200: {
      description: 'Returns the dead-letter rows.',
      content: {
        'application/json': {
          schema: listDeadLetterWebhookDeliveriesVoSchema,
        },
      },
    },
  },
  tags: ['admin'],
});

export const listDeadLetterWebhookDeliveries = async () => {
  return axios.get<IListDeadLetterWebhookDeliveriesVo>(
    LIST_DEAD_LETTER_WEBHOOK_DELIVERIES
  );
};