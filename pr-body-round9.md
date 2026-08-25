# Wave I (Round 14) — Enterprise admin parity

Five-feature wave continuing the OSS-vs-Cloud gap fill on the
`comet/teable-oss-vs-cloud-gap-fill` branch.

| Stage | Feature | Tests |
| --- | --- | --- |
| 70 | Org-level 自定义角色 (custom role + assignment + scope) | 57 |
| 71 | Audit retention 政策 (hot/cold/purge tiers + sweep) | 37 |
| 72 | Email domain claim (DNS TXT 验证 + auto-join) | 54 |
| 73 | Org-level 配额 reservation (priority-aware) | 41 |
| 74 | Cross-base 视图 / Federation (event/interval/manual refresh) | 48 |
| **Total** | | **237** |

Each stage follows the established four-file invariant:
`*.types.ts` + `*.service.ts` (pure helpers) + `*.auth.service.ts`
(NestJS @Injectable with PrismaService) + `*.spec.ts` (mocked).

## Stage 70 — Custom roles
- 18 capability flags (row/field/view/automation/attachment/api)
- 3 scope kinds (view / field / row)
- 64 max roles per org, 64 caps per role, 256 scopes per role
- Assignment lookup with built-in fallback + inherited resolution

## Stage 71 — Retention policy
- hot / cold / purged tier decisions with plan-derived defaults
- Storage targets: s3 / oss / gcs / azure-blob
- Sweep batcher with 5000-event cap and storage-bytes estimation

## Stage 72 — Domain claim
- pending / verified / failed / revoked lifecycle
- open / review / locked join modes
- DNS TXT verification with `teable-verify=<token>` resolver callback
- Auto-join candidate matching by email suffix

## Stage 73 — Quota reservation
- active / released / expired / consumed status with priority ranks
- 256 reservations per org cap, 7-day default TTL
- Sweep + decide() returns effective remaining and reserved-for-others

## Stage 74 — Federation view
- active / paused / broken / draft status; event/interval/manual refresh
- 32 sources per view, 256 fields per source, 10k events per refresh
- nextRefreshAt, stalenessSeconds, shouldRefreshNow, consumeEvents
- NestJS service handles refresh lifecycle and persistence

## Prisma additions
- CustomRole, RoleAssignment
- AuditRetentionPolicy, AuditRetentionJob
- EmailDomainClaim, EmailDomainClaimAudit
- OrgQuotaReservation
- FederationView, FederationSource, FederationEvent, FederationRefresh

All five commits land on the existing branch; tests pass locally
(pnpm exec vitest run, 237/237 new tests, ESLint clean).