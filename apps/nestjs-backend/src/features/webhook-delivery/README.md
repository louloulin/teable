# Webhook delivery (Stage 53 + Wave 10 / T-13)

Outbound webhook dispatcher with retry + dead-letter queue, plus the
admin endpoint that re-queues dead-letter rows.

## Layout

- `webhook-delivery.types.ts` — pure interfaces (`IWebhookDelivery`,
  `IWebhookEndpoint`, `IWebhookDispatcher`, ...).
- `webhook-delivery.service.ts` — pure helpers: payload signing,
  backoff math, dispatcher state machine, dead-letter decision,
  Prisma row mapper, id generators.
- `webhook-delivery.auth.service.ts` — Prisma-backed wrapper
  exposing `enqueue`, `listDue`, `dispatchOne`, `listDead`,
  `retryDead`, `retry` (fresh-attempt re-queue), `deleteDelivery`.
- `webhook-delivery.admin.controller.ts` — admin HTTP surface (see
  below).
- `http-webhook.dispatcher.ts` — `IWebhookDispatcher` implementation
  used by the auth service in production. Posts the body via the
  global `fetch` with an `AbortController` for the timeout.
- `webhook-delivery.module.ts` — registers the auth service with the
  HTTP dispatcher + PrismaService, and exposes the admin controller.

## Admin endpoint

```
POST /api/admin/webhook/delivery/:id/retry
```

- Gated by `@Permissions('instance|update')` — the global
  `PermissionGuard` translates that to the instance-admin check
  (`isAdmin`); non-admin callers get `RESTRICTED_RESOURCE`.
- `:id` is validated as a UUID via `ZodValidationPipe`; malformed
  values are rejected with `400 BadRequestException`.
- Calls `WebhookDeliveryAuthService.retry(id, requesterId)` which
  preserves the original `dead` row and creates a fresh
  `attempt=0` delivery so the dispatcher treats it as a brand-new
  run.
- Errors are translated: `/not found/` → `404 NotFoundException`,
  `/dead-letter/` → `400 BadRequestException`.

Response: `{ retried: true, attemptId: string }`.

## Frontend surface

The admin panel (`apps/nextjs-app/src/features/app/blocks/admin/webhook/`)
renders dead-letter rows in a table and calls `retryWebhookDelivery(id)`
from `@teable/openapi` after a confirmation dialog. The new attempt id
is surfaced in a success toast.
