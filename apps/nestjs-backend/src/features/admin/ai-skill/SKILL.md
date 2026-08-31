# Teable AI Skill (Self-Hosted)

> Query and update data, manage tables, and create automations or apps from your AI agent against a self-hosted Teable OSS instance.

## Install Teable Skill (Self-Hosted)

Copy this prompt into your AI agent:

```
Please read the following skill files to learn how to use Teable:

  - https://<your-teable-host>/api/admin/enterprise-readiness/ai-skill/files/SKILL.md  (this file)
  - https://<your-teable-host>/api/admin/enterprise-readiness/ai-skill/files/AUTH.md     (auth setup)
  - https://<your-teable-host>/api/admin/enterprise-readiness/ai-skill/files/API.md      (HTTP endpoints)
  - https://<your-teable-host>/api/admin/enterprise-readiness/ai-skill/files/EXAMPLES.md  (query/mutation examples)

Then help me complete a task against this Teable instance. Ask me for a personal access token if you don't already have one.
```

Or install the skill files locally:

```bash
mkdir -p ~/.teable-skill
for f in SKILL.md AUTH.md API.md EXAMPLES.md; do
  curl -sS "https://<your-teable-host>/api/admin/enterprise-readiness/ai-skill/files/$f" -o "$HOME/.teable-skill/$f"
done
ls ~/.teable-skill/
```

## What This Skill Provides

- 10 capability manifests (query / mutate / create / schema / automation / app)
- 4 reference documents (this + auth + API + examples) accessible via plain HTTP GET
- Bilingual examples (English + 中文)
- Zero external dependencies — works fully offline against any self-hosted Teable

## Quick-Start Prompts

After loading the skill, try one of these:

```
Create a CRM table in <Base> with fields: company (text), contact (email), status (single-select), notes (long-text).
```

```
List all records in <Table> {paste table URL} where status = "Open" and created_at > 2026-01-01.
```

```
Upload all CSVs in ./invoices to <Receipt Table> and auto-detect column types.
```

```
Create an automation on <Table>: when a new row's status becomes "Done", send a Slack message to #general.
```

## Skill File Index

| File | Purpose | Size |
| --- | --- | --- |
| `SKILL.md` | This file — install + quick-start | ~2 KB |
| `AUTH.md` | API token creation, scopes, error codes | ~3 KB |
| `API.md` | All HTTP endpoints with method/path/auth | ~5 KB |
| `EXAMPLES.md` | Query / mutation / automation / bulk examples | ~6 KB |

## Compatibility

This skill targets Teable OSS ≥ v1.10 (Round-24+ enterprise-readiness). It uses only the public REST API and does not require admin tokens for read operations.
