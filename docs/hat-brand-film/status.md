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
