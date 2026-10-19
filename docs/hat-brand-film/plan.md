<!-- Full user-approved implementation plan, saved verbatim (approved 2026-10-19). Do not edit; record progress in status.md. -->

# Hat Brand Film Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build the approved reusable hat campaign in the existing FUSE app.
**Architecture:** Add an opt-in versioned hat-film recipe to the existing graph runner. Route typed inputs through one shared world definition and product locks, then finalize clips through the existing editor/export system.
**Tech Stack:** Existing React/TypeScript frontend, Supabase edge functions/Postgres, current image/video providers and render worker.
**Spec:** outputs/FUSE-Hat-Campaign-Template-Spec.md

## Global Constraints
- Use existing FUSE AI Studio project f8513825-94a6-4c8d-ae1f-b88e22a49b58; preserve unrelated campaigns and billing.
- Output 1080 × 1920, 30 fps, 645 frames, 21.5 seconds and 12 separately downloadable clips.
- Frame cuts: 0,43,72,109,147,189,223,265,340,370,414,493,645.
- Product geometry and typography come from photos. Top and underside brim colors are independent.
- Vibe affects environment only. Logo ending uses the supplied original asset.
- Draft/test first. A renderer queue is not a finished video.
- Execution method: use the authorized existing Lovable project; inspect its actual changes and test results before publication. No further design approval is needed after the user's explicit approval.

## Review Focus
- Left/right references accidentally merged or mirrored: task 1 routing assertions.
- Vibe renders in the form but never reaches the model: task 2 provider-boundary assertions.
- Missing optional details cause invented designs or lost branches: tasks 1 and 3 fallback tests.
- Duplicate completion callbacks charge or export twice: task 4 concurrent idempotency tests.
- Missing renderer produces fake success or silent audio/logo loss: task 4 failure assertions and task 5 real render inspection.

## Task 1: Typed uploads and versioned recipe
Files: existing template-inputs.ts, template-editor.ts, lab-template-detail/index.ts, TemplateCanvas.tsx, TemplateStudioPage.tsx; add _shared/hat-film-recipe.ts and tests plus additive migration/seed as necessary.
Interface: validated HatFilmInputs with front/right/left/back/inside/logo image slots, optional detail images/labels, required brand_vibe string; HatFilmRecipe pins shot routing and output frames.
- [ ] Write and run failing tests for required-field validation, distinct angle slots, optional-detail fallback, and exact 12-shot/645-frame manifest.
- [ ] Implement typed inputs and recipe without affecting legacy templates.
- [ ] Show labels, wearer orientation guidance and real prompt field in existing UI.
- [ ] Run tests and record changes.

## Task 2: Runtime world and product binding
Files: _shared/prompt-nodes.ts, _shared/executor.ts; add _shared/hat-film-prompts.ts and tests.
Interface: compileHatFilmRun(inputs, recipe) -> immutable run context with shared world, product constraints and shot-specific prompt/reference mappings.
- [ ] Write failing tests comparing construction vs luxury vibes, preserved product references, exact top/under brim constraints, prompt injection containment and no stale brand references.
- [ ] Implement opt-in runtime text binding and one coherent world definition per run using existing capabilities.
- [ ] Verify final provider prompts contain customer vibe and correct image mappings; no unresolved placeholders.
- [ ] Run tests and record changes.

## Task 3: Stills, individual clips and fidelity gates
Files: _shared/executor.ts and existing generation/result UI; new focused helper where needed.
Interface: per-shot lifecycle retains still/clip IDs and fidelity state; at most one automatic corrective retry with accounted costs.
- [ ] Test missing inputs fail before charge, failure preserves completed outputs, omitted optional detail uses known angle, and rejected shot never silently advances.
- [ ] Generate stills with shot-specific references, validate, then animate with correct short camera moves.
- [ ] Preserve logo via compositing and product identity via reference-grounded checks; honestly flag review if automated checks cannot verify.
- [ ] Run tests and record provider/model constraints and actual output readiness.

## Task 4: Automatic assembly/export
Files: _shared/executor.ts terminal handling, fuse-mcp/core/exports.ts and existing editor/export services; add focused auto-assembly helper and tests.
Interface: finalizeHatFilm(jobId, recipe) idempotently creates exact ordered edit, logo composites and soundtrack, dispatches render, and publishes final artifact only when playable.
- [ ] Write failing tests for duplicate/concurrent callbacks, exact 645-frame ordering, source-audio mute, soundtrack association, logo inclusion, failed clip and unavailable renderer.
- [ ] Implement durable automatic finalization only for the opt-in recipe, preserving partial clips and retry behavior.
- [ ] Wire Creating images / Animating shots / Assembling video / Ready to actual server state.
- [ ] Run tests and verify real connected worker capability for soundtrack/compositing, without printing credentials.

## Task 5: Seed, test, review and make usable
Files: isolated Hat Brand Film graph/version and tests/documentation in existing FUSE project.
- [ ] Create new draft graph with all input slots and 12 branches; never edit another template.
- [ ] Attach the corrected reference film/audio as private template assets, with current product photos as test inputs only.
- [ ] Run representative construction generation and alternate-world binding checks; inspect sample stills, clips and completed final render.
- [ ] Review actual diff, test output and browser form. Fix important defects before publication.
- [ ] Publish only the validated template and necessary reviewed app changes; return template URL plus exact tested/untested status.

## Execution record
- Approved by user on 2026-10-19.
- Baseline Lovable commit: 4fab588b195bf70947f759b46d873c889cf453f6.
- Ruling: use existing Lovable implementation environment, not a new local app/worktree; this is the user's existing FUSE project and authorized target.
