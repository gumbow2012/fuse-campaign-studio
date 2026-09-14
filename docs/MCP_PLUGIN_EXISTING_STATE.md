# MCP / Plugin — existing state (audit, 2026-09-14)

Short internal note. Guides the build; not a design doc.

## What already exists

| Area | What | Reuse? |
|---|---|---|
| MCP v1 | Edge fn `fuse-mcp` v28 (deployed on ykrrw, **not in this repo**). Custom `{action}` JSON API: key mgmt (JWT) + `discovery` / `template.get` / `job.status` (API key). `run.create` stubbed 501. | Replace in place. Keep the key-management actions so `/account/developer` keeps working. |
| Local bridge | `~/Downloads/fuse-mcp-bridge.mjs` — stdio→HTTP shim with 3 tools, hardcoded to the v28 action API. | Superseded by remote `/mcp`. Keep as local-dev example only. |
| API keys | Tables `api_keys` (sha256 `key_hash`, `key_prefix`, `scopes[]`, `rate_limit_per_min`, `revoked_at`, `last_used_at`) + `api_key_usage`. UI `/account/developer` (`src/pages/mvp/DeveloperApiKeysPage.tsx`, `src/services/apiKeys.ts`). Scopes today: `templates:read`, `runs:read`, `runs:create`. | Reuse. Map legacy scopes → `fuse.*` scopes. |
| Catalog | `lab-template-catalog` (public: only versions with `review_status='Approved'`), `template-detail-page` (public detail: inputs, counts, aspect), `fuse_templates.slug`, `template_preview_media` (poster_path for videos). | Reuse the same queries/rules (`_shared/template-inputs.ts`, `_shared/template-pricing.ts`). |
| Run | `start-template-run` (user JWT; body `{versionId, inputs{slotKey:url}}`; charges via `apply_credit_transaction`, refunds on failure; NO idempotency on the main path; `LAB_RUNNER_CODE` bypass must never be used by MCP). | Call as the user (Bearer user JWT). Prepare/confirm/idempotency added in the MCP layer. |
| Status | `_shared/job-status.ts` `buildJobStatusResponse` (progress, stage graph, outputs, public failure copy), `get-job-status`. | Reuse the shared builder directly. |
| Results | `run-results` (deployed, not in repo): owner-scoped signed outputs + failed steps + friendly error; creates edit project when video present. | Reuse RPC `create_edit_project_for_run`; sign via `_shared/signed-media.ts`. |
| Editor | `edit-project-update` (RPC `edit_project_apply` ops reorder/trim/mute/volume/remove/restore/duplicate, optimistic revision), tables `campaign_edit_projects/_segments/_exports`. | Reuse the RPC. |
| Export | `export-campaign` (RPC `create_campaign_export` + Cloud Run render worker via `app_config.render_worker_url`), `finalize-export`, `get-export-download` (signed mp4). | Reuse RPC + same worker dispatch. Honest `awaiting_worker` status if worker unset. |
| Uploads | `upload-run-input` (signed upload URLs into `fuse-assets` under `<uid>/run-inputs/…`, 12 MB images / 60 MB video). Storage RLS: users read only `<uid>/…`. | Same paths + limits. Signed upload URLs from the admin client. |
| Credits | `profiles.credits_balance`, `apply_credit_transaction` RPC, pricing tiers in `_shared/template-pricing.ts` (210…945 by output count), creator surcharge `_shared/creatorSurcharge.ts`. | Server recomputes cost; never trust client. |
| Auth | Supabase Auth. **OAuth 2.1 server is DISABLED** (`/auth/v1/.well-known/oauth-authorization-server` → `feature_disabled`). Supabase OAuth has no custom scopes (only openid/email/profile/phone). | Enable in dashboard (owner). Consent page + connected-apps page to build (`supabase.auth.oauth.*`). |
| Hosting | Vercel serves the SPA (`vercel.json` rewrites everything to index.html). No Node API. Edge functions deploy from `supabase/functions/*` on push via GitHub Action. Several deployed fns are repo-orphans (`run-results`, `export-campaign`, `edit-project-update`, `get-export-download`, `claim-export`, `finalize-export`, `sign-edit-media`, `retry-failed-run`, `fuse-mcp`). | Add external rewrites for `/mcp`, `/api/*`, `/openapi.json`, `/.well-known/oauth-protected-resource*` → the `fuse-mcp` edge function. |
| Analytics | `track()` frontend, `analytics_events` table, `audit_logs` table (+ `logAuditEvent`). | MCP logs to a new `mcp_tool_calls` table + `audit_logs`. |

## What is missing (built in this pass)
- Real MCP protocol (JSON-RPC over Streamable HTTP, stateless JSON responses) at `/mcp` — tools/prompts/resources.
- Public REST `/api/*` + OpenAPI 3.1 (`/openapi.json`) from the same tool registry.
- Prepare → confirmation token → start (HMAC-signed, expiring) + idempotency table.
- Upload sessions / attach / drafts for MCP clients.
- Clean per-template AI metadata (`template_ai_metadata`) — hand-written descriptions, product types, use cases.
- ChatGPT App UI resources (`ui://fuse/*`, `text/html;profile=mcp-app`).
- OAuth: protected-resource metadata, consent page `/oauth/consent`, connected-apps page.
- Docs.

## Must not touch
Stripe/billing secrets, webhook handlers, `create-checkout`, payouts, `LAB_RUNNER_CODE`, the credit charge logic inside `start-template-run` (called as-is, as the user).

## Secrets / config required (owner, not handled here)
- Supabase → Authentication → OAuth Server: **enable**, authorization path `/oauth/consent`, dynamic client registration ON (needed by Claude.ai + ChatGPT), Site URL = `https://fuse-us.com`.
- Optional pre-registered OAuth client for a Custom GPT (redirect `https://chat.openai.com/aip/<gpt-id>/oauth/callback`).
- `render_worker_url` / token in `app_config` already govern exports (unchanged).
- No new env secrets: the MCP signing secret is generated once into `service_config.mcp_signing_secret`.

## Official endpoints
- MCP: `https://fuse-us.com/mcp` (Streamable HTTP; GET → 405, no SSE). Direct: `https://ykrrwgkxgidoavtzcumk.supabase.co/functions/v1/fuse-mcp/mcp`.
- Staging: `https://ykrrwgkxgidoavtzcumk.supabase.co/functions/v1/fuse-mcp-staging/mcp` (same code, `FUSE_MCP_ENV=staging` label, not linked anywhere).
- OpenAPI: `https://fuse-us.com/openapi.json`. REST: `https://fuse-us.com/api/*`.
- Protected resource metadata: `https://fuse-us.com/.well-known/oauth-protected-resource` (authorization server `https://ykrrwgkxgidoavtzcumk.supabase.co/auth/v1`).
- ChatGPT app UI resources are served over MCP `resources/read` (`ui://fuse/...`), no separate host.
