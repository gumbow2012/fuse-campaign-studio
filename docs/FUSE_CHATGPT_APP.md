# FUSE — ChatGPT App (Apps SDK / MCP Apps)

The MCP server at `https://fuse-us.com/mcp` doubles as the ChatGPT app: tools declare `_meta.ui.resourceUri` / `openai/outputTemplate` pointing at `ui://fuse/*` resources served over `resources/read` with mimeType `text/html;profile=mcp-app`.

## Widgets (`supabase/functions/fuse-mcp/widgets/index.ts`)
| Resource | Used by | Shows |
|---|---|---|
| `ui://fuse/template-search.html` | search | template cards, preview, outputs, plan, **Use this campaign** |
| `ui://fuse/template-detail.html` | get template | what you upload / get, plan, **Prepare campaign**, Open in FUSE |
| `ui://fuse/upload.html` | upload session / attach | one slot per input with a file picker (PUTs to the signed URL, then calls `fuse_attach_uploaded_assets`) |
| `ui://fuse/confirm-run.html` | prepare | campaign, uploads, outputs, credits vs balance, **Run this campaign** |
| `ui://fuse/run-status.html` | start / status | progress, stage, counts, previews, refresh |
| `ui://fuse/output-gallery.html` | outputs / history | images + clips with download, edit/open editor |
| `ui://fuse/editor.html` | timeline / save edit | reorder, remove/restore, save, export |
| `ui://fuse/pricing.html`, `ui://fuse/credits.html` | pricing / credits | plans in campaigns per month; balance + fit |

Widgets read `window.openai.toolOutput`, call tools with `window.openai.callTool`, and hand off to the model with `sendFollowUpMessage` (e.g. confirming a run). CSP: `connectDomains`/`resourceDomains` = the Supabase project + fuse-us.com. Dark surface, cyan accents, Orbitron headings.

## Auth
Tools carry `securitySchemes` (`noauth` for public tools, `oauth2` with the scope otherwise). 401s include `WWW-Authenticate` with `resource_metadata`; tool errors include `_meta["mcp/www_authenticate"]` so ChatGPT prompts the user to connect FUSE. Authorization server = Supabase Auth OAuth 2.1 (PKCE S256, dynamic client registration). ChatGPT redirect URIs: `https://chatgpt.com/connector_platform_oauth_redirect`.

## Test in ChatGPT
Settings → Apps & connectors → Developer mode → **Create** → MCP server URL `https://ykrrwgkxgidoavtzcumk.supabase.co/functions/v1/fuse-mcp-staging/mcp` (staging) or `https://fuse-us.com/mcp` → OAuth. Then: "Show me FUSE templates for a jewelry brand."

## Publishing checklist
- [ ] OAuth server enabled + dynamic client registration ON (Supabase dashboard)
- [ ] `https://fuse-us.com/privacy` and `/terms` live
- [ ] Staging run-through: search → detail → upload → prepare → confirm → start → status → outputs
- [ ] App name FUSE, icon, short description, support email
- [ ] Remove the staging URL from any submitted config
