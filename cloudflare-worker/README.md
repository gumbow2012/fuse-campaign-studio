# FUSE Cloudflare Worker

Handles job orchestration, R2 asset storage, and Weavy integration for the FUSE platform.

## Setup

```bash
cd cloudflare-worker
npm install
```

## Configure Secrets

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put WEAVY_API_KEY
wrangler secret put WEAVY_API_BASE_URL
```

## Create R2 Bucket

```bash
wrangler r2 bucket create fuse-assets
```

## Development

```bash
npm run dev
```

## Deploy

```bash
npm run deploy
```

After deploying, copy the Worker URL and set it as `VITE_CF_WORKER_URL` in your FUSE project.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/jobs/submit` | Submit a new job |
| GET | `/jobs/:projectId/status` | Poll job status |
| POST | `/jobs/rerun-step` | Rerun a specific step |
| GET | `/assets/:key` | Serve R2 assets |
| GET | `/health` | Health check |

All `/jobs/*` routes require a valid Supabase JWT in the `Authorization: Bearer <token>` header.
