# Teable Authentication Guide (Self-Hosted)

> All API endpoints (except `/healthz`, `/api/auth/*`, `/api/admin/enterprise-readiness/ai-skill*`) require an API token.

## Token Types

| Type | Scope | Use Case |
| --- | --- | --- |
| Personal Access Token | All bases you can access | Long-lived scripts / agents (recommended for AI agents) |
| Space Access Token | All bases in a space | CI / shared workflows |
| Base Access Token | Single base | Tightest scoping |
| OAuth2 (Cloud only) | Per user, expiring | Cloud multi-tenant apps |

For self-hosted OSS, use **Personal Access Token** — generated in the web UI under `Account Settings → Developer`.

## Creating a Token (Web UI)

1. Open `https://<host>/account`
2. Click `Developer` → `Personal access tokens`
3. Click `Generate token`
4. Pick a name (e.g. `claude-code-agent`) and scopes:
   - `read:records` (required for queries)
   - `write:records` (required for mutations)
   - `read:schema` (required for table listing)
   - `write:schema` (only if creating tables)
   - `automation:write` (only if creating automations)
5. Copy the token — it is shown **only once**

## Using the Token

Pass as `Authorization: Bearer <token>` header on every request:

```bash
curl -sH "Authorization: Bearer tbk_xxxxxxxxxxxxxxxx" \
     "https://<host>/api/table/viXXXXXXXXXXX/records"
```

## Token Errors

| HTTP | body.code | meaning | fix |
| --- | --- | --- | --- |
| 401 | `unauthorized` | missing / malformed token | add `Authorization` header |
| 401 | `token_expired` | token past `expiresAt` | regenerate token |
| 403 | `forbidden` | scope missing for this resource | grant `write:records` etc. |
| 403 | `permission_denied` | role lacks table permission | ask base owner to grant `editor` role |
| 429 | `rate_limited` | too many requests | wait + retry, see `Retry-After` header |

## Cross-Origin (CORS)

Self-hosted Teable accepts cross-origin requests by default. If you customized CORS, allow your AI agent's origin (e.g. `http://localhost:3001`).

## Revoking

Revoke a token by clicking the trash icon next to it on the Developer page. The token becomes invalid immediately; no cache layer.

## Security Notes

- Never commit tokens to git. Use `op`, `1Password`, `pass`, or environment variables.
- Rotate every 90 days for production agents.
- For untrusted scripts, use a base-scoped token with `read:records` only.
