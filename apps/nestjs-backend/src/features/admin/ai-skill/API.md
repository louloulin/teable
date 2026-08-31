# Teable HTTP API Reference (Self-Hosted)

> All paths below are under `https://<host>` and require `Authorization: Bearer <token>` unless marked **public**.

## Spaces & Bases

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/spaces` | yes | List spaces you belong to |
| POST | `/api/spaces` | yes | Create a space |
| GET | `/api/base/:baseId` | yes | Get a base metadata |
| POST | `/api/base` | yes | Create a base |
| DELETE | `/api/base/:baseId` | yes | Trash a base (recoverable for 30 days) |

## Tables

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/base/:baseId/tables` | yes | List tables in a base |
| POST | `/api/base/:baseId/tables` | yes | Create a table |
| GET | `/api/table/:tableId` | yes | Get table schema (fields, views) |
| PATCH | `/api/table/:tableId` | yes | Rename / reorder fields |
| DELETE | `/api/table/:tableId` | yes | Delete a table |
| GET | `/api/table/:tableId/fields` | yes | List fields with full type info |
| POST | `/api/table/:tableId/fields` | yes | Add a field |
| PATCH | `/api/field/:fieldId` | yes | Update field config |
| DELETE | `/api/field/:fieldId` | yes | Delete a field |

## Records

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/table/:tableId/records` | yes | List / query records |
| POST | `/api/table/:tableId/records` | yes | Create records (batch ≤ 100) |
| PATCH | `/api/table/:tableId/records` | yes | Update records (batch) |
| DELETE | `/api/table/:tableId/records` | yes | Delete records (batch) |
| GET | `/api/table/:tableId/record/:recordId` | yes | Get a single record |

## Query Parameters (GET /records)

| Param | Type | Example | Description |
| --- | --- | --- | --- |
| `view` | viewId | `viwXXX` | Filter by view's filters & sort |
| `filterByFormula` | formula | `{status} = "Open"` | Apply formula filter |
| `sort[0][field]` | fieldName | `created_at` | Sort by field |
| `sort[0][order]` | `asc` / `desc` | `desc` | Sort direction |
| `fields[]` | fieldName | `name,status` | Only return these fields |
| `maxRecords` | int | `50` | Limit total results |
| `pageSize` | int | `100` | Page size (default 100, max 1000) |
| `offset` | string | cursor | Pagination cursor |

## Views

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/table/:tableId/views` | yes | List views |
| POST | `/api/table/:tableId/views` | yes | Create a view |
| PATCH | `/api/view/:viewId` | yes | Update view (filters, sort, etc.) |
| DELETE | `/api/view/:viewId` | yes | Delete a view |

## Automations (Round-24+)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/automation` | yes | Create an automation |
| GET | `/api/automation?baseId=X` | yes | List automations in a base |
| GET | `/api/automation/:id` | yes | Get automation detail |
| DELETE | `/api/automation/:id` | yes | Delete an automation |
| POST | `/api/automation/run` | yes | Manually trigger a run |
| POST | `/api/automation/ai-draft` | yes | Generate a draft from a natural-language prompt (LLM) |
| GET | `/api/automation/catalog` | public | Action / trigger catalog |
| GET | `/api/automation/script-samples` | public | 12 bilingual sample scripts |
| GET | `/api/automation/script-samples/:id` | public | Single script sample |

## Apps / Webhooks (Round-15+)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/app/:appId/install` | yes | Install an app template |
| POST | `/api/webhook/:tableId` | public | Incoming webhook (signature verify) |
| POST | `/api/integration-connector/catch-hook/:installId` | public | Public Catch Hook URL |

## Enterprise Readiness (Round-13+)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/admin/enterprise-readiness` | admin | Full readiness report |
| GET | `/api/admin/enterprise-readiness/ai-skill` | public | This skill manifest |
| GET | `/api/admin/enterprise-readiness/ai-skill/files/:name` | public | Skill reference files |
| GET | `/api/admin/enterprise-readiness/migration-sources` | admin | Migration source registry |
| GET | `/api/admin/enterprise-readiness/cloud-gap-roadmap` | admin | Top-fillable gaps |

## Public / Discovery

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/healthz` | public | Liveness probe |
| GET | `/api/auth/sign-in` | public | Email + password login |
| GET | `/api/auth/sign-out` | yes | Logout |

## Pagination Convention

All list endpoints return:

```json
{
  "records": [...],
  "offset": "cursor-string-or-null"
}
```

If `offset` is non-null, pass it back as `?offset=...` to get the next page.

## Field Types

`singleLineText`, `longText`, `richText`, `number`, `percent`, `currency`, `rating`, `duration`, `date`, `dateTime`, `singleSelect`, `multipleSelects`, `checkbox`, `attachment`, `user`, `email`, `phone`, `url`, `barcode`, `autoNumber`, `formula`, `rollup`, `lookup`, `count`, `createdTime`, `lastModifiedTime`, `createdBy`, `lastModifiedBy`, `link`, `button`, `ai`.

## Error Codes

| HTTP | code | when |
| --- | --- | --- |
| 400 | `validation_error` | request body failed zod validation |
| 401 | `unauthorized` | missing/expired token |
| 403 | `forbidden` | missing scope or role |
| 404 | `not_found` | resource does not exist or trashed |
| 409 | `conflict` | duplicate field name, unique violation, optimistic-lock fail |
| 422 | `unprocessable` | formula syntax error, field-type mismatch |
| 429 | `rate_limited` | per-token quota exceeded |
| 500 | `internal_error` | server bug (check `trace_id` in logs) |
