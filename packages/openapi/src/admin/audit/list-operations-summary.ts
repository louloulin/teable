/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * OpenAPI client for the audit summary endpoint — admin only. Returns a
 * count + per-action rollup so the admin UI banner can render "X total,
 * Y distinct actions" without paying for the full row payload.
 */
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { axios } from '../../axios';
import { registerRoute } from '../../utils';
import { auditListQuerySchema } from './list-operations';

export const auditListSummaryPerActionSchema = z.object({
  action: z.string(),
  count: z.number().int(),
});

export const auditListSummaryVoSchema = z.object({
  total: z.number().int(),
  distinctActions: z.number().int(),
  perAction: z.array(auditListSummaryPerActionSchema),
});

export type IAuditListSummaryVo = z.infer<typeof auditListSummaryVoSchema>;

export const GET_ADMIN_AUDIT_OPERATIONS_SUMMARY = '/admin/audit/operations/summary';

export const GetAdminAuditOperationsSummaryRoute: RouteConfig = registerRoute({
  method: 'get',
  path: GET_ADMIN_AUDIT_OPERATIONS_SUMMARY,
  description: 'Summarise recent audit operations (admin only).',
  request: {
    query: auditListQuerySchema,
  },
  responses: {
    200: {
      description: 'Returns total + per-action rollup.',
      content: {
        'application/json': {
          schema: auditListSummaryVoSchema,
        },
      },
    },
  },
  tags: ['admin', 'audit'],
});

export const listAuditOperationsSummary = async (query: IAuditListQuery = {}) => {
  return axios.get<IAuditListSummaryVo>(GET_ADMIN_AUDIT_OPERATIONS_SUMMARY, { params: query });
};