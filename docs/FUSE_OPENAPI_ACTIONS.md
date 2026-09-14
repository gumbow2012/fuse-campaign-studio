# FUSE — Custom GPT Actions (OpenAPI)

Schema: `https://fuse-us.com/openapi.json` (OpenAPI 3.1, generated from the same tool registry as MCP). Servers: `https://fuse-us.com`.

## Add to a Custom GPT
1. GPT builder → Configure → **Create new action** → Import from URL → `https://fuse-us.com/openapi.json`.
2. Authentication:
   - **API key** (works today): type *API Key*, auth type *Bearer*, key = a `fuse_live_…` key from `https://fuse-us.com/account/developer` with the scopes you want. (One key = one FUSE account; fine for a private GPT.)
   - **OAuth** (public GPT): register an OAuth client in Supabase (Authentication → OAuth Apps) with redirect `https://chat.openai.com/aip/<gpt-id>/oauth/callback`; authorization URL `https://ykrrwgkxgidoavtzcumk.supabase.co/auth/v1/oauth/authorize`, token URL `…/auth/v1/oauth/token`, scope `email`, PKCE S256.
3. Privacy policy URL: `https://fuse-us.com/privacy` (required by OpenAI for public GPTs).

## Operations
`searchTemplates`, `getTemplate`, `listTemplateCategories`, `getPricingSummary`, `getHelp` (public) · `checkAccountCredits`, `createUploadSession`, `attachUploadedAssets`, `prepareCampaignRun`, `startCampaignRun`, `generateImagesFromTemplate`, `getRunStatus`, `listRunOutputs`, `getDownloadLinks`, `renameCampaign`, `getCampaignTimeline`, `saveCampaignEdit`, `exportCampaign`, `getExportStatus`, `cancelRun`, `getCampaignHistory` (account).

## Test prompts
- "Show me FUSE templates for a jewelry brand." → `searchTemplates`
- "Run the Grillz campaign with this product image <public https URL>." → `getTemplate` → `createUploadSession` → `attachUploadedAssets` (with `source_url`) → `prepareCampaignRun` → user confirms → `startCampaignRun` → `getRunStatus`.

## Limitations vs the ChatGPT App
No widgets (cards, upload picker, gallery) — plain JSON. File upload from the chat itself is not possible with Actions; the GPT must pass a public https `source_url` or the user uploads in FUSE. Same confirmation + idempotency rules apply.
