# Quota / SLA Subsystem

> Self-host OSS parity with Teable.ai Cloud plans — adds a Postgres-backed
> quota, usage-counter and audit-hit pipeline that all four Cloud plans
> (`free`, `pro`, `business`, `enterprise`) and the self-host default route
> through. Designed to be the storage substrate for the Admin Panel, billing
> dashboard, and license activation endpoints that ship later.

## Files

```
apps/nestjs-backend/src/features/quota/
├── README.md                  ← this file
├── quota.constants.ts         ← plan-level caps, metric↔column map, sentinels
├── quota.types.ts             ← DTO / report shapes
├── quota.exception.ts         ← QuotaExceededException (HTTP 402 + meta)
├── quota.service.ts           ← read, check, consume, setPlanLimits
├── quota.controller.ts        ← REST surface (admin-token gated PUT)
├── quota.module.ts            ← Nest wiring; registered in app.module.ts
└── quota.service.spec.ts      ← unit tests

packages/db-main-prisma/prisma/postgres/
├── schema.prisma                                ← +PlanLevel, +QuotaMetric enums, +SpaceQuota / +SpaceUsageCounter / +QuotaHit models
└── migrations/20260824000000_add_quota_tables/  ← backfill for existing spaces
```

## Plan → limit table

| Plan       | rows   | attachment | automations/mo | AI credits | seats |
| ---------- | ------ | ---------- | -------------- | ---------- | ----- |
| `free`       | 1,000    | 1 GB        | 100            | 200        | 1     |
| `pro`        | 250,000  | 10 GB       | 25,000         | 1,000      | 10    |
| `business`   | 1,000,000| 100 GB      | 100,000        | 2,000      | 100   |
| `enterprise` | ∞        | ∞           | ∞              | ∞          | ∞     |
| `self_hosted`| ∞        | ∞           | ∞              | ∞          | ∞     |

`null` (or `-1` sentinel) on `SpaceQuota.*Limit` columns = unlimited; the
service treats both as "never throws". `self_hosted` is the OSS default and
is enforced for every fresh space unless a license-key activation flow
explicitly calls `QuotaService.setPlanLimits()`.

## Public API (programmatic)

```ts
// Bootstrapping — called from SpaceService.createSpaceByParams:
await quota.ensureForSpace(spaceId, 'self_hosted');

// Read (admin panel / space-settings):
const report = await quota.getUsage(spaceId);

// Soft check (UI / dry-run):
const { allowed, reason, cap, used } = await quota.check(spaceId, 'rows', 500n);

// Hard check + counter increment (feature hot paths):
try {
  await quota.consume(spaceId, 'attachment_bytes', uploadedBytes, {
    actorId: user.id,
    resource: `attachment:${attachmentId}`,
  });
} catch (err) {
  if (err instanceof QuotaExceededException) {
    // 402 returned upstream; UI shows upgrade CTA
  }
}

// License activation / admin override:
await quota.setPlanLimits(spaceId, {
  plan: 'business',
  addons: { rows: 500_000 },
}, adminUserId);
```

## REST surface

```
GET  /api/quota/:spaceId        — usage report (auth required)
PUT  /api/quota/:spaceId        — replace plan + limits (TEABLE_ADMIN_TOKEN)
```

The PUT path mirrors the Cloud `license activate` flow; the admin-token gate
is intentionally simple so operators can wire their own IAM in front of it.

## How call sites wire in (Stage 2 — not in this turn)

For now the subsystem is **storage-only**: `ensureForSpace` runs on every
new space, and the REST surface exposes the report. The next stage hooks
feature services into `consume(...)`:

| Feature service     | Metric            | When to call |
| ------------------- | ----------------- | ------------ |
| `record.service`      | `rows`            | batch insert / paste / import |
| `attachments.service` | `attachment_bytes`| upload finalize |
| `automation.runner`   | `automation_runs` | pre-execute |
| `ai.service`          | `ai_credits`      | pre-call (depends on model token estimate) |
| `auth.guard`          | `seats`           | invite accept |

Each call site must be transactional with the actual side-effect — never
`consume()` after the write, or quota leaks when the write fails. The
counter row's `capSnapshot` is captured at period start so dashboards can
report "1000 / 25000" even after the cap is raised.

## Tests

```bash
cd apps/nestjs-backend
pnpm test src/features/quota
```

`quota.service.spec.ts` covers:

- `ensureForSpace` is idempotent
- `check()` returns `allowed=false` with reason when over cap
- `consume()` skips enforcement for `self_hosted`
- `consume()` throws `QuotaExceededException` and rolls back on overflow
- `consume()` happy-path persists the counter
- Plan constants match the Cloud pricing page

## Self-host OSS behaviour

- Every fresh space gets a `self_hosted` row at creation time.
- All caps are null → `consume()` and `check()` both treat it as unlimited.
- The admin REST endpoint stays disabled until `TEABLE_ADMIN_TOKEN` is set.
- License-key activation (later stage) calls `setPlanLimits()` to flip the
  row to `pro` / `business` / `enterprise`. The space-data (Postgres tables,
  attachments, automations) is never touched — pure metadata change.