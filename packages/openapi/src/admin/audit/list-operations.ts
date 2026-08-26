/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * OpenAPI client for the admin audit-log read endpoint introduced in
 * R1-T03. Mirrors the backend zod schema in
 * `apps/nestjs-backend/src/features/audit/audit.query.schema.ts`.
 */
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { axios } from '../../axios';
import { registerRoute } from '../../utils';

/** Wire shape of one audit row. `createdAt` is an ISO string on the wire. */
export const auditListRowSchema = z.object({
  id: z.string(),
  action: z.string(),
  resourceId: z.string(),
  userId: z.string().nullable(),
  rootAction: z.string().nullable(),
  operationId: z.string().nullable(),
  createdAt: z.string(),
});

export type IAuditListRow = z.infer<typeof auditListRowSchema>;

/** Server response for `GET /api/admin/audit/operations`. */
export const auditListVoSchema = z.object({
  rows: z.array(auditListRowSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
});

export type IAuditListVo = z.infer<typeof auditListVoSchema>;

/** Query schema shared by both list + summary. */
export const auditListQuerySchema = z.object({
  action: z.string().min(1).max(128).optional(),
  resourceId: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export type IAuditListQuery = z.infer<typeof auditListQuerySchema>;

export const GET_ADMIN_AUDIT_OPERATIONS = '/admin/audit/operations';

export const GetAdminAuditOperationsRoute: RouteConfig = registerRoute({
  method: 'get',
  path: GET_ADMIN_AUDIT_OPERATIONS,
  description: 'List recent audit operations (admin only).',
  request: {
    query: auditListQuerySchema,
  },
  responses: {
    200: {
      description: 'Returns the matching audit rows.',
      content: {
        'application/json': {
          schema: auditListVoSchema,
        },
      },
    },
  },
  tags: ['admin', 'audit'],
});

export const listAuditOperations = async (query: IAuditListQuery = {}) => {
  return axios.get<IAuditListVo>(GET_ADMIN_AUDIT_OPERATIONS, { params: query });
};