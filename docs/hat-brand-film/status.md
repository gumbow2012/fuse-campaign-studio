# Hat Brand Film — status

Draft only. Not published, not deployed, no paid generation run.

## Identifiers
- Draft graph template id: `6a7f2c10-4b1e-4c3a-9d55-1f0e8a2b7c01`
- Draft graph version id (inactive): `6a7f2c10-4b1e-4c3a-9d55-1f0e8a2b7c02`, recipe `hat_brand_film@1`
- Earlier placeholder row in this project's `templates` table: `72dc1b6b-9732-4684-956c-edfab5632134` (not a runnable graph)
- Seed: admin-only `hat-film-seed` function, `{"action":"seed"}`; idempotent upserts on fixed ids.

## Built
- Typed form: 6 required images, 3 optional detail images + labels, required vibe (13 fields), wearer-orientation guide, vibe placeholder.
- Validation before charge; immutable run context (one concrete shared world, product locks, per-shot prompts/references) snapshotted before debit.
- Executor opt-in: Hat prompts and references replace generic prompt text only on nodes tagged with the recipe.
- One automatic retry per shot, then Needs review.
- Browser assembly (`src/workers/hatFilm.worker.ts`): frame-exact 645 frames at 30 fps, 1080×1920 H.264, hard cuts, generated audio dropped, soundtrack-only AAC trimmed to 21.5 s, original logo composited (shot 06) and a 152-frame logo hold drawn from the shot 12 still. Sources shorter than their slot fail and are never padded.
- Durable lock: database compare-and-set on the job row; same tab resumes after reload; another tab is refused.
- Ready only after the server downloads the uploaded file and re-probes it (1 video track, 645 samples, 1080×1920, AAC ≈21.5 s). Browser-reported numbers are ignored.
- Upload names include the field key for Hat runs only; other templates keep their old file names.

## Tests
- `node --experimental-strip-types --test tests/hat-brand-film/hat-film.test.mjs`: 17 pass, 0 fail.

## Not verified / blockers
- This backend has no graph tables (`nodes`, `edges`, `template_versions`, `execution_jobs`), so the seed and a real run can't execute here.
- `FAL_API_KEY` is missing, so live prices and generation are unverified. Fallback estimate: 12 stills + 11 five-second clips ≈ $7.96 / 82 credits; worst case with one retry per shot ≈ $15.92 / 163 credits.
- The browser assembler has not run on real clips; WebCodecs needs desktop Chrome or Edge.
- Shot 06 composites the logo at a fixed sign area. It doesn't track a generated sign.
- Automated product-fidelity scoring is not implemented. Shots fail review only when a check flags them.

## Backend environments (verified 2026-10-19, read-only)
- Production fuse-us.com bundle calls backend `ykrrwgkxgidoavtzcumk` (also hardcoded in client fallback and supabase/config.toml). Code pushed to main deploys edge functions there via GitHub Actions. This is the graph engine backend (fuse_templates, template_versions, nodes, edges, execution_jobs); the agent has no SQL access to it.
- This workspace's SQL tools and .env point at `sdmwcjfksoqbplcqqmhg`, which has only the legacy `templates` table and no graph tables.
- Row `72dc1b6b-9732-4684-956c-edfab5632134` lives in sdmw `templates` (inactive). It is NOT a Hat Brand Film template; leave it inactive, ignore it.
- The real draft must be created on ykrr by an admin calling `hat-film-seed` {"action":"seed"} after the functions deploy there. Fixed IDs make preview and production refer to the same draft.
