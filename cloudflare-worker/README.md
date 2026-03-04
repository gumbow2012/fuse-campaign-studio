# FUSE Cloudflare Worker

Handles job orchestration, R2 asset storage, credit checks, and Weavy AI integration for the FUSE platform. This is the sole execution layer — all AI pipeline calls route through here.

## Architecture

```
Frontend (Bearer JWT)
    ↓
Worker (shiny-rice-e95bfuse-api)
    ├── Auth: Verify Supabase JWT
    ├── Credits: Check/deduct balance
    ├── Weavy: Firebase token exchange → recipe trigger → poll status
    ├── R2: Asset upload/serve (fuse-assets bucket)
    └── Supabase: Update project/step status
```

## Setup

```bash
cd cloudflare-worker
npm install
```

## Required Secrets

Set via `wrangler secret put` or Cloudflare Dashboard → Worker → Settings → Variables and Secrets:

| Secret | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `WEAVY_API_BASE_URL` | Weavy API base (e.g. `https://app.weavy.ai`) |
| `WEAVY_FIREBASE_API_KEY` | Firebase API key (`AIza...`) for token exchange |
| `WEAVY_REFRESH_TOKEN` | Weavy `spiTokens` refresh token |

## R2 Bucket

```bash
wrangler r2 bucket create fuse-assets
```

Bound as `ASSETS` in `wrangler.toml`.

## Development

```bash
npm run dev
```

## Deploy

```bash
npm run deploy
```

Or push to `main` — GitHub Actions auto-deploys when `cloudflare-worker/` files change.

## Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/upload` | JWT | Upload image to R2 |
| POST | `/api/run-template` | JWT | Run template (credits + Weavy trigger) |
| GET | `/api/job/:jobId` | JWT | Poll Weavy job status |
| GET | `/api/usage` | JWT | Get credits, runs, ledger |
| POST | `/jobs/submit` | JWT | Submit a new job |
| GET | `/jobs/:projectId/status` | JWT | Poll project status |
| POST | `/jobs/rerun-step` | JWT | Rerun a specific step |
| POST | `/weavy/trigger` | JWT | Trigger Weavy recipe directly |
| GET | `/weavy/flow/:id` | — | Proxy Weavy flow editor |
| GET | `/assets/:key` | — | Serve R2 asset |
| GET | `/health` | — | Health check |
