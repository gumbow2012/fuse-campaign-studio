# Hat Brand Film — implementation status (2026-10-19)

Spec: `spec.md` · Plan: `plan.md` (both as approved by the owner).

## Done (draft, not deployed, not published)
- `supabase/functions/_shared/hat-film-recipe.ts` — recipe `hat_brand_film@1`: 13 typed fields, validation before charge (required, distinct angles, vibe length), 12-shot / 645-frame cut list, per-shot reference routing, optional-detail matching by label, hard-cut edit list.
- `supabase/functions/_shared/hat-film-prompts.ts` — `compileHatFilmRun`: one shared world per run, product locks (independent top/underside brim colors), vibe sanitizing (instruction and stale-brand containment), per-shot still and motion prompts.
- `supabase/functions/_shared/hat-film-assembly.ts` — phases, one auto retry then Needs review, idempotent render dispatch decision, render manifest (muted clips, logo overlays on shots 06/12, soundtrack), Ready only after a verified 1080×1920 / 645-frame / audio probe.
- `tests/hat-brand-film/hat-film.test.mjs` — 11 tests, all passing (`node --experimental-strip-types --test tests/hat-brand-film/hat-film.test.mjs`).

## Not done / blockers
- **Renderer:** this backend has no render worker setting (`service_config` has no render keys; there's no `app_config` table and no `campaign_edit_*` tables). Automatic final assembly can't run here, so it reports `render_unavailable` honestly.
- **Executor wiring:** the opt-in hook in `executor.ts` (`finalizeJobIfTerminal` → `decideAssembly`) and the template graph seed aren't wired yet, because they need the renderer and the test assets.
- **No template row created yet:** no template or version ID exists. The draft is created once assets arrive.
- **Assets:** reference film, soundtrack and test hat photos have not been supplied. No paid generation has run.
- **World resolution** is deterministic text parsing; an AI-expanded world can replace `resolveWorld` with the same contract.

## Update 2026-10-19 21:30 UTC — assets received
- Reference film checked: H.264 1080×1920, 30 fps, 645 frames, 21.5 s, plus an AAC track. Soundtrack: AAC, 21.59 s.
- Stored in the private `fuse-assets` bucket: `system/templates/hat-brand-film/v1/{reference-film.mp4,soundtrack.m4a}`. Fixtures (test only, never defaults) are under `system/fixtures/hat-brand-film/trade-culture/{front,right,left,back,inside,logo}.webp`. Right = Side-skull, left = Side-slogan. Brim colors: top black, underside light gray.
- Draft template row: `templates.id = 72dc1b6b-9732-4684-956c-edfab5632134`, `is_active=false`, recipe/version `hat_brand_film@1`. It has no graph nodes yet. There is no separate versions table in this backend.
- Estimate (fallback prices: nano-banana-pro $0.15/still, Kling 3.0 Pro $0.112/s, audio off): 12 stills + 11 five-second clips = $7.96 (82 credits). With one retry per shot, worst case is $15.92 (163 credits). Live fal pricing has not been verified because `FAL_API_KEY` isn't set in this backend.
- Render gap: no render worker setting and no editing/export tables in this backend.
