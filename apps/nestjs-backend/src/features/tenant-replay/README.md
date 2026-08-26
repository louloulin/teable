# Tenant Replay Harness

> T-05 (Comet Native — `teable-oss-vs-cloud-gap-fill`)

A minimal but useful harness for replaying a captured tenant's shape (spaces,
bases, tables, views, field metadata, attachment counts, automation-run counts)
into a fresh OSS environment.  Designed for **debugging**, **support**, and
**migration dry-runs** — *not* for byte-faithful data migration.

This module is **deliberately not wired into `AppModule`**.  The CLI scripts
boot a dedicated Nest application context that imports only
`TenantReplayModule`, which keeps the boundary between "production app" and
"replay harness" clean and prevents accidental activation in production.

## Layout

```
src/features/tenant-replay/
├── tenant-replay.types.ts          ITenantSnapshot / IReplayReport / IReplayOptions
├── tenant-anonymize.util.ts        Pure PII scrubbing helpers (testable w/o DB)
├── tenant-snapshot.service.ts      captureSnapshot(targetSpaceId) → ITenantSnapshot
├── tenant-replay.service.ts        replay(snapshot, options) → IReplayReport
├── tenant-replay.module.ts         NestJS wiring (DI only, no controllers)
├── tenant-replay.service.spec.ts   Unit tests (anonymizer + report shape)
├── cli/
│   ├── replay-capture.ts           CLI entry — exports runCaptureCli(argv)
│   └── replay-restore.ts           CLI entry — exports runRestoreCli(argv)
└── README.md
```

Top-level entrypoints at `apps/nestjs-backend/scripts/`:

- `tenant-replay-capture.ts`
- `tenant-replay-restore.ts`

## Snapshot format (`ITenantSnapshot`)

```jsonc
{
  "version": 1,
  "capturedAt": "2026-08-26T10:00:00.000Z",
  "capturedBy": "tenant-replay",
  "anonymized": "none",            // or "scrub"
  "sourceSpaceId": "spc...",
  "spaceName": "Acme HQ",
  "bases": [
    {
      "sourceBaseId": "bse...",
      "name": "Operations",
      "icon": null,
      "order": 1,
      "collaboratorCount": 2,
      "automationRunCount": 7,
      "tables": [
        {
          "sourceTableId": "tbl...",
          "name": "Projects",
          "dbTableName": "projects",
          "order": 1,
          "fields": [{ /* raw prisma field row */ }, ...],
          "views":  [{ /* raw prisma view row  */ }, ...],
          "recordStats": {
            "rowCount": 42,
            "fieldIds": ["fld...", ...]
          },
          "pendingSchemaOperations": 1,
          "attachmentCount": 3
        }
      ]
    }
  ],
  "users": [
    { "sourceUserId": "usr...", "name": "...", "email": "...", "isAdmin": true, "isSystem": false }
  ],
  "summary": {
    "baseCount": 1, "tableCount": 1, "viewCount": 1, "fieldCount": 2,
    "userCount": 2, "schemaOperationCount": 1, "attachmentCount": 3,
    "approxRecordCount": 42
  }
}
```

**What is NOT captured:** record bodies (only counts), attachment file bytes,
formula / automation definitions, OAuth tokens, session data, audit logs.

## Usage

### 1. Capture a snapshot

```bash
pnpm exec tsx apps/nestjs-backend/scripts/tenant-replay-capture.ts \
  spcXXXXXXXXXXXXXXXXX \
  /tmp/acme-snapshot.json
```

Add `--anonymize` to scrub user emails and display names in place:

```bash
pnpm exec tsx apps/nestjs-backend/scripts/tenant-replay-capture.ts \
  spcXXXXXXXXXXXXXXXXX \
  /tmp/acme-snapshot.json \
  --anonymize
```

The command prints a small JSON summary and exits `0` on success.  Bad
arguments exit `2`, runtime errors exit `1`.

### 2. Restore into a fresh environment

```bash
pnpm exec tsx apps/nestjs-backend/scripts/tenant-replay-restore.ts \
  /tmp/acme-snapshot.json \
  --out /tmp/acme-replay.report.json
```

The replay builds:

1. A new space named `Replay Space <ISO timestamp>` (override with
   `--target-space-name`).
2. For each captured base: a new base.
3. For each captured table: a new table with the captured fields and views,
   skipping link / rollup / formula / lookup / count / auto-number fields
   (those need a foreign table that hasn't been recreated yet — they show
   up as warnings in the report, not failures).
4. `rowsPerTable` mock records (default `3`) seeded via the existing
   `RecordOpenApiService`.

A summary report (`ok`, `durationMs`, `counts`, `errors`, `baseIdMap`,
`tableIdMap`, `newSpaceId`) is written to the path you pass to `--out` (or
to `<input>.report.json` if you omit it).

### Replay options

| Flag                    | Effect                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `--rows N`              | Number of mock records to seed per table (default `3`).                                      |
| `--no-anonymize`        | Restore with real user names/emails. Default is **scrubbed**.                                |
| `--anonymize`           | Force anonymisation even when the snapshot is not yet scrubbed.                              |
| `--fail-fast`           | Throw on the first error instead of collecting into `errors[]`.                              |
| `--no-schema-ops`       | Skip the schema-op drain (currently a no-op — see "Known limits").                           |
| `--target-space-name X` | Override the auto-generated destination space name.                                          |
| `--out <path>`          | Where to write the JSON report. Default: `<input>.report.json`.                              |

### Anonymisation policy

- `none` keeps emails, names and display strings verbatim.
- `scrub` rewrites every captured user row to `User N` / `userN@example.test`,
  and replaces the captured space name with `Space (<sourceSpaceId>)`.

The scrub is **deterministic on input order** so two re-runs of the same
snapshot produce identical anonymised output.  It runs at capture time
when `--anonymize` is passed, or at restore time when the snapshot's
`anonymized` flag is `scrub` or the operator passes `--anonymize`.

## Known limits

- **No record bodies.** The harness never carries real record values; it
  only counts and seeds blanks.  Use the existing base-duplicate pipeline
  if you need a byte-faithful copy.
- **No view / formula / automation body replay.** View metadata IS captured,
  but formula expressions and automation triggers are not — only the
  `pendingSchemaOperations` count.
- **No link / rollup / conditional-rollup / formula fields.** These require
  a foreign table that has not been recreated yet.  They are skipped
  silently and surfaced as a `safeFields < total fields` gap in the report.
- **Schema-op drain is a stub.** The V2 schema-op runner is asynchronous
  and timer-driven; for the CLI replay path we record a `(0, 0)` summary
  in the report.  Wire to the existing `V2SchemaOperationRunnerService` if
  you need synchronous draining.
- **No password / OAuth token replay.** Users in the snapshot are metadata
  only; you cannot sign in as them in the replay space without re-onboarding.

## AGPL-3.0 compliance

This module is part of the AGPL-3.0 codebase and follows the same licence.
The capture / restore scripts read from and write to the host's database
and filesystem; running them on a third party's tenant without their consent
may violate local data-protection law.  Use `--anonymize` when sharing
snapshots externally.
