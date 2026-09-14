# FUSE MCP — setup

FUSE is an MCP server. Any MCP client (Claude.ai connectors, Claude Desktop, ChatGPT apps, Cursor, the MCP Inspector) can search campaign templates, upload a product photo, prepare and run a campaign with explicit confirmation, poll status, download outputs, edit clips and export a final video.

## Endpoints

| What | URL |
|---|---|
| MCP (production) | `https://fuse-us.com/mcp` — Streamable HTTP, JSON responses, stateless (no session id, `GET` → 405). |
| MCP (direct, same code) | `https://ykrrwgkxgidoavtzcumk.supabase.co/functions/v1/fuse-mcp/mcp` |
| MCP (staging) | `https://ykrrwgkxgidoavtzcumk.supabase.co/functions/v1/fuse-mcp-staging/mcp` — same code, labelled `staging`, unlinked. |
| Protected resource metadata | `https://fuse-us.com/.well-known/oauth-protected-resource` |
| REST + OpenAPI | `https://fuse-us.com/api/*`, `https://fuse-us.com/openapi.json` |
| Health | `https://fuse-us.com/health` |

The production host is a Vercel rewrite to the edge function (see `vercel.json`). Nothing on `/mcp` needs the Supabase `apikey` header.

## Auth

- **Public tools** (`fuse_search_templates`, `fuse_get_campaign_template`, `fuse_list_template_categories`, `fuse_get_pricing_summary`, `fuse_get_help`) need no token.
- **Account tools** need `Authorization: Bearer <token>` where the token is either
  - an **OAuth 2.1 access token** from FUSE's authorization server (Supabase Auth OAuth server at `https://ykrrwgkxgidoavtzcumk.supabase.co/auth/v1`, PKCE, dynamic client registration, consent page `https://fuse-us.com/oauth/consent`), or
  - a **developer API key** `fuse_live_…` created at `https://fuse-us.com/account/developer` (scoped, hashed at rest, per-minute rate limit, shown once).
- A tool called without the right token returns `AUTH_REQUIRED` / `FORBIDDEN_SCOPE` with `next_action`, plus `WWW-Authenticate: Bearer resource_metadata="…"` on 401 so clients start the OAuth flow.

Scopes: `fuse.templates.read`, `fuse.pricing.read`, `fuse.account.read`, `fuse.assets.write`, `fuse.runs.prepare`, `fuse.runs.create`, `fuse.runs.read`, `fuse.outputs.read`, `fuse.editor.write`, `fuse.exports.create`. Supabase OAuth has no custom scopes, so an OAuth-connected user gets the full set (that is exactly what the consent screen says); API keys carry only the scopes chosen at creation.

## Tools (20)

| Tool | Scope | What it does |
|---|---|---|
| `fuse_search_templates` | public | Search real templates by product/intent; returns counts, credits, plan inclusion. |
| `fuse_get_campaign_template` | public | What you upload / what you get / credits / sample outputs. |
| `fuse_list_template_categories` | public | Use cases, product types, industries with real counts. |
| `fuse_get_pricing_summary` | public | Plans in campaigns per month, promo, packs, per-template fit. |
| `fuse_get_help` | public | Approved help copy. |
| `fuse_check_account_credits` | `fuse.account.read` | Plan, balance, can-run verdict. |
| `fuse_create_upload_session` | `fuse.assets.write` | Signed PUT URLs per input (expire, typed, size-capped). |
| `fuse_attach_uploaded_assets` | `fuse.assets.write` | Verify + attach uploads (or fetch a public https URL). |
| `fuse_prepare_campaign_run` | `fuse.runs.prepare` | Dry run: inputs, server-side cost, balance, `confirmation_token`. |
| `fuse_start_campaign_run` | `fuse.runs.create` | Starts the run. Needs the token + idempotency key. |
| `fuse_generate_image_from_template` | `fuse.runs.create` | Image-first alias; says honestly that the template's clips render too. |
| `fuse_get_run_status` | `fuse.runs.read` | Progress, stage, counts, previews. |
| `fuse_list_run_outputs` | `fuse.outputs.read` | Signed previews + downloads. |
| `fuse_get_output_download_links` | `fuse.outputs.read` | Fresh links (ZIP reported as not available). |
| `fuse_rename_campaign` | `fuse.editor.write` | Name used in downloads/exports. |
| `fuse_get_campaign_timeline` | `fuse.outputs.read` | Clip order/trims/mutes. |
| `fuse_save_campaign_edit` | `fuse.editor.write` | Reorder / trim / mute / remove (non-destructive). |
| `fuse_export_campaign` | `fuse.exports.create` | Final video render (honest `awaiting_worker` if the worker is not configured). |
| `fuse_get_export_status` | `fuse.outputs.read` | Poll export, download link. |
| `fuse_cancel_run` | `fuse.runs.create` | Honest: runs can't be stopped once rendering; failed outputs auto-refund. |
| `fuse_get_user_campaign_history` | `fuse.runs.read` | Recent runs. |

Prompts: `find_campaign_for_product`, `run_campaign_from_uploads`, `create_images_only`, `edit_and_export_campaign`, `explain_fuse_to_streetwear_owner`. Resources: `fuse://templates`, `fuse://templates/{slug}`, `fuse://pricing`, `fuse://docs/getting-started`, `fuse://docs/credits`, `fuse://user/campaigns`, `fuse://runs/{run_id}`, plus the `ui://fuse/*` widgets.

## Claude setup

1. Claude → Settings → Connectors → **Add custom connector**.
2. Name **FUSE**, URL `https://fuse-us.com/mcp`.
3. Click connect — Claude discovers the OAuth server, registers itself, and sends you to `https://fuse-us.com/oauth/consent`. Approve.
4. Enable FUSE in a chat and ask: "Find me a hoodie campaign template."

Claude Code / Cursor (API key): `claude mcp add --transport http fuse https://fuse-us.com/mcp --header "Authorization: Bearer fuse_live_…"`.

## ChatGPT setup

See `docs/FUSE_CHATGPT_APP.md` (Apps) and `docs/FUSE_OPENAPI_ACTIONS.md` (Custom GPT Actions).

## Local dev

```bash
npx --yes deno@2.6.1 check supabase/functions/fuse-mcp/index.ts   # type check (existing _shared warnings are pre-existing)
supabase functions serve fuse-mcp --no-verify-jwt                  # then POST http://localhost:54321/functions/v1/fuse-mcp/mcp
npx @modelcontextprotocol/inspector                                # point it at the URL above
```

## Sample prompts

"Find me the best FUSE campaign for a hoodie drop." · "I sell grillz — what campaign should I use?" · "Use the Changing Room template with this hoodie photo." · "How many credits will this use?" · "Download all files from my last campaign." · "Rename this campaign to Kola Hoodie Drop." · "Put clip 3 first, remove clip 5, and export the final video."

## Known limitations

- Image-only / video-only runs: templates render both together; the tool says so.
- ZIP / social-pack exports: not rendered by the API (per-file links instead).
- Cancel: not possible once providers are rendering (failed outputs auto-refund).
- Final-video export needs the Cloud Run render worker (`app_config.render_worker_url`); without it exports stay `queued_backend_required`.
- Video posters are returned only when a real poster exists.
