## Round 7 — Wave B: integrations, search, AI fields (5 modules)

| Stage | Module | Tests | Prisma tables |
|-------|--------|-------|---------------|
| 33 | Integration connector (Zapier / Make / n8n / Slack / HubSpot / Sheets) | 34 | IntegrationProvider, IntegrationInstall, IntegrationEventLog |
| 36 | Airtable bi-directional sync | 39 | AirtableConnection, AirtableTableMapping, AirtableSyncRecord, AirtableSyncLog |
| 38 | JS / Python / Go / Java SDK platform | 43 | SdkApp, SdkToken, SdkUsageLog, SdkRelease |
| 42 | Per-table full-text search | 36 | SearchIndex, SearchDocument, SearchQueryLog, SearchSynonym |
| 31 | AI fields (autoClassify / Summarize / Translate) | 50 | AiField, AiFieldRun, AiFieldTemplate |

**202 new unit tests** added in Wave B across 5 modules — all pass.

Notes for review:
- Stage 33 ships a bundled catalog of 6 providers (Zapier, Make, n8n, Slack, HubSpot, Google Sheets) with HMAC-SHA256 signing + 5-min timestamp drift check on catch-hook receivers.
- Stage 36 enforces direction rules in `deriveAllowedMutations` (push/pull/bi-directional) so a `one-way-pull` mapping can never create rows on Airtable.
- Stage 38 stores only SHA-256 of access tokens (`tblk_<48 hex>` plaintext revealed once) and uses Crockford-style uppercase clientIds to avoid I/O confusion.
- Stage 42 uses BM25-style scoring with light suffix stemming, snippet generation, and per-index or global synonym dictionaries.
- Stage 31 enforces op-specific config validation (label uniqueness for classify, maxLength 1–4096 for summarize, targetLang for translate) with deterministic config hashing.

Co-Authored-By: Claude <noreply@anthropic.com>