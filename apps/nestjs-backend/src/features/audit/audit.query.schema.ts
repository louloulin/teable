/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Zod query schema for the admin audit-list endpoint. Lives in the backend
 * so it can be referenced from `audit.controller.ts` via `ZodValidationPipe`,
 * and the openapi package holds a parallel schema for the client SDK so the
 * wire contract has a single source of truth.
 */
import { z } from 'zod';

/**
 * Single shape used by both `GET /api/admin/audit/operations` and
 * `GET /api/admin/audit/operations/summary`. Kept tiny on purpose — the
 * caller can narrow to one specific action / resourceId and pick a limit.
 *
 *   - `action`     optional action name (e.g. `http_request`, `createRecord`)
 *   - `resourceId` optional resource id (e.g. `tblABC`, `recXYZ`)
 *   - `limit`      bounded to [1, 1000]; mirrors `clampAuditLimit` in helpers
 */
export const listAuditOperationsQuerySchema = z.object({
  action: z.string().min(1).max(128).optional(),
  resourceId: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export type IListAuditOperationsQuery = z.infer<typeof listAuditOperationsQuerySchema>;