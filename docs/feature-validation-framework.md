# Fuse Feature Validation Framework

Every feature change that touches template creation, template running, billing, uploads, or output quality must ship with implementation plus verification.

## Required Local Checks

Run these before pushing:

1. `npm run test`
2. `npm run build`
3. Targeted lint when touching a focused file, for example `npx eslint src/pages/TemplateCanvas.tsx`

## Template Builder Smoke

For draft-builder changes, validate this exact flow:

1. Open `/app/lab/canvas`.
2. Confirm `Setup` and `Branches` are the only draft-builder steps.
3. Confirm `Next` is disabled until `Template Name` is filled.
4. Set inputs to `8`; confirm the UI clamps to the current product cap.
5. Set branches to a different count than inputs.
6. Go to `Branches`; confirm each branch can choose any source upload.
7. Leave guide image uploads empty on at least one branch.
8. Click `Create Draft`.
9. Confirm the draft is created without a hidden-reference-required error.
10. Confirm the created graph has:
    - user upload nodes equal to the setup input count
    - image/video branches equal to the branch count
    - hidden reference nodes only for branches that uploaded a guide image

## Run And Output Audit

Every new template must complete one admin run before publishing.

1. Open the draft in `/app/lab/canvas`.
2. Open `Run Selected Template`.
3. Upload realistic 9:16-compatible test assets for every user upload.
4. Run the template.
5. Wait for job status to reach `complete` or `failed`.
6. If failed, record the job id, error, and failing node.
7. If complete, audit every exposed output:
   - expected garment/logo/product appears
   - hidden guide scene/style is respected when provided
   - no hidden reference asset is exposed as a customer input
   - image/video count matches the branch design
   - output is not blank, corrupted, or obviously wrong

## Third-Party Review Pass

Use this when a human reviewer needs to validate output quality.

For each run, provide:

- template name and version
- job id
- source input screenshots
- output images/videos
- branch-level expected behavior
- verdict: `approved`, `prompt drift`, `provider issue`, or `blocked`
- one sentence explaining any failure

Record results in the admin audit flow or in `docs/template-audit-sheet.md` until the audit UI is the source of truth.

The admin output audit UI is the source of truth for publish gates. A run that has open, bad, or blocking output reports cannot publish the template version even if the overall audit exists.

## Release Rule

Do not publish a draft version live until:

- builder smoke passes
- one real admin run completes
- output audit passes
- the reviewer verdict is `approved`

The `admin-template-workbench` publish action enforces this server-side. UI state is only a guide; activation still fails if Supabase does not have the completed approved run.
