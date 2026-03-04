# FUSE Campaign Studio

AI-powered creative campaign platform. Upload assets, run templates powered by Weavy AI, and get production-ready outputs.

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Lovable Cloud (Supabase) — auth, database, edge functions, storage
- **Orchestration**: Cloudflare Worker — job pipeline, R2 asset storage, Weavy AI integration
- **CI/CD**: GitHub Actions — auto-deploy worker on push

## Architecture

```
Frontend (React)
    ↓ Bearer JWT
Cloudflare Worker (shiny-rice-e95bfuse-api)
    ├── Supabase (auth, credits, projects, steps)
    ├── R2 (fuse-assets bucket)
    └── Weavy AI (recipe execution)
```

## Local Development

```sh
git clone <YOUR_GIT_URL>
cd fuse-campaign-studio
npm install
npm run dev
```

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` (auto-managed) | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env` (auto-managed) | Supabase anon key |
| `VITE_CF_WORKER_URL` | `.env` (optional) | Cloudflare Worker URL (fallback hardcoded) |

## Cloudflare Worker

See [`cloudflare-worker/README.md`](cloudflare-worker/README.md) for setup, secrets, and deployment details.

### Required Worker Secrets

Set via `wrangler secret put` or Cloudflare Dashboard:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEAVY_API_BASE_URL`
- `WEAVY_FIREBASE_API_KEY`
- `WEAVY_REFRESH_TOKEN`

## GitHub Actions

The worker auto-deploys on push to `main` when files in `cloudflare-worker/` change. Manual dispatch also available to sync secrets.

### Required GitHub Secrets

- `CLOUDFLARE_API_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEAVY_API_BASE_URL`
- `WEAVY_FIREBASE_API_KEY`
- `WEAVY_REFRESH_TOKEN`

## Deployment

- **Frontend**: Publish via Lovable (Share → Publish)
- **Backend**: Edge functions deploy automatically
- **Worker**: Auto-deploys via GitHub Actions or `cd cloudflare-worker && npm run deploy`

## Key Routes

| Page | Path | Description |
|---|---|---|
| Landing | `/` | Marketing page |
| Templates | `/templates` | Browse campaign templates |
| Dashboard | `/dashboard` | User dashboard with projects |
| Template Run | `/templates/:id/run` | Execute a template |
| Job Status | `/job/:id` | Poll job progress |
| Admin | `/admin` | Admin panel (role-gated) |
| Billing | `/billing` | Subscription & credits |

## License

Private — All rights reserved.
