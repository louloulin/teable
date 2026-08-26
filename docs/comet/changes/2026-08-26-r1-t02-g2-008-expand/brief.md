# Brief: R1-T02 — g2-008 callsite expansion (8 → ≥30)

# Outcome

Extend the g2-008 thin-DI wrapper pattern from **8 callsites** to **≥30 callsites** across `apps/nestjs-backend/src/features/`, and add **≥3 new controller endpoints** (one of which must ship a passing e2e-spec) so the wave proves the pattern composes at controller boundary too.

# Scope

## Background

The supervisor branch (`agent/chong/df9d120d2105-stage6-audit-log`) merged g2-008 in commit `41d8183ae`. g2-008 introduced a "thin-DI wrapper" convention: each feature exposes its pure helpers through a NestJS-injectable wrapper so downstream modules can `@Inject()` a single class reference instead of importing loose functions.

Eight features adopted the pattern in g2-008:
- `webhook-bridge`, `webhook-canvas`, `webhook-delivery`
- `byok-kms`, `byok-llm`, `kms-encryption`
- `dr-canvas`, `workspace-mirror`

## What this change does

Add the **same thin-DI surface** to **22 additional feature modules**, and wire **3 new HTTP endpoints** through `apps/nestjs-backend/src/open-api/`.

### 22 feature modules to extend

Pick **22** of the following candidates that do not already have a thin-DI wrapper. Order is roughly by ease (simplest first):

1. `access-token` — token validation pure helpers
2. `audit` — query DSL pure helpers
3. `auth` — login/logout pure helpers
4. `base-share` — share token helpers
5. `builtin-assets-init` — init helpers
6. `canary` — health check helpers
7. `collaborator` — collaborator validation
8. `comment` — thread pure helpers
9. `dashboard` — widget calculation
10. `data-loader` — loader pure helpers
11. `database-view` — view query helpers
12. `domain-verification` — DNS verification helpers (Stage 3.5)
13. `export` — export format helpers
14. `field` — field type validation
15. `import` — import parsing helpers
16. `integrity` — data integrity checks
17. `invitation` — invite token helpers
18. `ip-allowlist` — IP range helpers (Stage 25)
19. `mail-sender` — email helpers (Stage 19)
20. `notification` — notification dispatch helpers (Stage 45)
21. `oauth` — OAuth grant helpers (Stage 16)
22. `pin` — pin code helpers

If a feature already has a `.module.ts` that follows the g2-008 shape (`@Injectable` wrapper class delegating to pure helpers in `.service.ts`), skip it and pick another from the list until **22 thin-DI wrappers** exist in total.

### 3 new HTTP endpoints

Add 3 thin controller endpoints that consume at least one of the new wrappers. Examples (pick whichever has the cleanest existing controller surface):

- `GET /api/access-token/validate` — wraps `access-token` thin service
- `POST /api/comment/thread/validate` — wraps `comment` thin service
- `GET /api/notification/recent` — wraps `notification` thin service

Each endpoint must:
- Use existing route guards from `apps/nestjs-backend/src/open-api/`
- Have a `*.e2e-spec.ts` test that exercises the HTTP path
- Return 200/4xx based on existing HttpErrorCode enum

# Acceptance

- **A1**: At least **30** feature modules under `apps/nestjs-backend/src/features/` have a thin-DI wrapper (count via `grep -rl "thin-DI wrapper" apps/nestjs-backend/src/features/ | wc -l`).
- **A2**: Exactly **3** new controller endpoints exist under `apps/nestjs-backend/src/open-api/` and each has an e2e-spec file in `apps/nestjs-backend/test/`.
- **A3**: `pnpm -F @teable/nestjs-backend test-unit` exits 0 (no new failures; pre-existing failures tolerated but reported).
- **A4**: `pnpm -F @teable/nestjs-backend typecheck` introduces **0 new** errors (pre-existing tsc errors in `*.e2e-spec.ts` are tolerated).
- **A5**: AGPL-3 compliance — no new top-level LICENSE; AGPL_LICENSE header retained on every new `.ts` file.
- **A6**: Zero new npm dependencies — `package.json` and `pnpm-lock.yaml` unchanged.
- **A7**: Zero modifications to existing hot paths — `auth.service.ts`, `record-open-api.service.ts`, `ai.service.ts`, `space.service.ts` (main bodies) must NOT change beyond import-only additions.

# Constraints

- **Thin-DI wrapper shape** (copy verbatim from g2-008 examples):
  - `<feature>.types.ts` — pure type/interface definitions, ≤90 LOC
  - `<feature>.service.ts` — pure helper functions (no `@Injectable`), ≤300 LOC
  - `<feature>.auth.service.ts` — `@Injectable` class that uses pure helpers + PrismaService, ≤350 LOC
  - `<feature>.module.ts` — `@Module({ providers: [...], exports: [...] })`, ≤50 LOC
  - `<feature>.service.spec.ts` — pure helper unit tests
  - `<feature>.auth.service.spec.ts` — Injectable service unit tests

- **Minimal-change rule**: each new file is **only** what's needed to satisfy the g2-008 shape. Do NOT add new business logic; if no existing helper exists, write 1-2 minimal helpers (≤30 LOC) just enough to satisfy the surface.

- **No hot-path edits**: do NOT modify the body of any handler or service file beyond adding import lines.

- **Naming**: keep existing class/function names in those features; add a `*AuthService` sibling if a service already exists with the same name (e.g., `comment.service.ts` → `comment.auth.service.ts`).

- **Wave 6 wiring compat**: do NOT remove any features wired into `app.module.ts`. New modules MUST be added (not removed) to `app.module.ts` imports list.

- **No dependency additions**: re-use existing PrismaService, ConfigService, Logger. No new `@Injectable`s requiring new deps.

# Out of scope

- Migrating any feature whose existing service file is **already** a thin-DI wrapper (i.e., the g2-008 8 are excluded).
- Modifying business logic, controller routes that exist today, or schema.
- Adding migrations.
- Touching the v2 packages, frontend, or `apps/nextjs-app`.

# Verification expectations

- **L1**: `pnpm -F @teable/nestjs-backend test-unit` → 0 new failures
- **L2**: `pnpm -F @teable/nestjs-backend typecheck` → 0 new errors
- **L3**: `grep -rl "thin-DI wrapper" apps/nestjs-backend/src/features/ | wc -l` → ≥ 30
- **L4**: `git diff --name-only main..HEAD | grep -E "test/.*\\.e2e-spec\\.ts" | wc -l` → ≥ 3 new spec files

# Risks

- **R1**: Some features (e.g., `auth`, `record`) are too large/complex to safely wrap in this turn. **Mitigation**: skip them, pick simpler candidates from the list.
- **R2**: Prisma schema may not have the table a wrapper assumes. **Mitigation**: keep wrappers pure (no DB writes); only `*AuthService` touches Prisma, and only for `findUnique`/`findFirst`.
- **R3**: tsbuildinfo / typecheck may show a flood of pre-existing errors. **Mitigation**: count only the delta vs `main`, do not chase pre-existing errors.

# Deliverables

- New `.ts` files: ≥ 22 × 4 = ≥ 88 new files (types / service / auth.service / module) plus ≥ 22 spec files
- 3 new e2e-spec files under `apps/nestjs-backend/test/`
- Updated `apps/nestjs-backend/src/app.module.ts` with new module imports
- One commit per 5-7 features for clean review granularity
- Final reply posting: counts + new endpoints + e2e results + push confirmation

# Estimates

- File count: ≥ 88 feature files + ≥ 3 e2e spec + 1 app.module update = ≥ 92 files
- LOC: ~22 × 600 LOC avg + 3 × 80 LOC e2e = ~13,400 LOC additions
- Effort: 4-6 days of focused work; **must be parallelized via subagent (this brief)**.

# Non-goals

- Do NOT migrate the g2-008 8 features (they are already done).
- Do NOT migrate any feature whose name appears in `apps/nestjs-backend/src/open-api/` route registry as a controller-class file (those have their own wiring).
- Do NOT add a custom RPC layer, gRPC, or any new framework surface.
- Do NOT edit any package.json/lockfile.
