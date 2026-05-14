# Fuse Template Creation Runbook

Use this when you need to record a client walkthrough or onboard someone to making templates.

## Current System

The live customer catalog is graph-based:

- Templates live in `fuse_templates`.
- Draft/live control lives in `template_versions`.
- User uploads, hidden references, image steps, and video steps live as graph `nodes`.
- Connections between nodes live as `edges`.
- The customer template list reads only active versions through `lab-template-catalog`.

Recommended admin route:

`/app/lab/canvas`

Secondary overview route:

`/admin/templates`

Avoid using `/admin/templates/import` for the main launch workflow unless you intentionally want the older HAR/R2 template path. It is not the cleanest source of truth for the graph catalog.

## Mental Model

A template is not one file. It is a versioned graph:

1. User Upload nodes: what the customer provides at runtime.
2. Hidden Reference nodes: fixed assets that lock the scene/style.
3. Image Step nodes: prompt-driven image generations.
4. Video Step nodes: prompt-driven video generations.
5. Edges: wiring that says which source feeds which model parameter.
6. Exposed outputs: final images/videos the customer receives.

Live vs draft is version-level:

- `is_active = true`: visible to customers.
- `is_active = false`: draft/internal only.
- Publishing one version deactivates the other versions for the same template.

## Make A New Template From Scratch

Use this when the template is new and you are building it manually.

1. Open `/app/lab/canvas`.
2. In `Draft Builder`, move through the two steps:
   - `Setup`: enter the required template name, optional description, user upload inputs, and output branch count.
   - `Branches`: pick the source upload for each output branch, add optional hidden guide images, and write image/video prompts.
3. Click `Create Draft`.
4. The draft opens as an internal draft. Upload admin test images in `Run Selected Template` and complete one canvas run before publishing.
5. If needed, refine labels, prompts, hidden references, and edges directly on the canvas.
6. Configure image steps:
   - Select each Image Step.
   - Write the prompt.
   - If this image should be delivered to the customer, check `Expose as final deliverable`.
   - If it is only an internal intermediate, leave it unchecked.
   - Click `Save Node`.
7. Configure video steps:
   - Select each Video Step.
   - Write the motion prompt.
   - Check `Expose as final deliverable` only for final videos.
   - Click `Save Node`.
8. Wire the graph:
   - Select a target node.
   - In `Add Incoming Edge`, choose the source node.
   - Set the target param:
     - Common image input: `image_1`, `image_2`, `reference_image`.
     - Common video input: `start_frame_image`.
   - Click `Connect to This Node`.
9. Check `Readiness`.
    - Fix missing prompts.
    - Fix missing hidden reference/sample URLs.
    - Fix disconnected image/video steps.
    - Make sure at least one final deliverable is exposed.
10. Test it in `Run Selected Template`.
    - Upload real inputs.
    - Click `Run From Canvas`.
    - Review latest outputs in the inspector.
11. Publish only after the test output is good:
    - If the version is draft, click `Publish Version Live`.

## Make A New Template By Cloning

Use this when the new template is similar to an existing one. This is usually faster and safer.

1. Open `/app/lab/canvas`.
2. Pick the closest working template.
3. Click `Clone as New Version` if you are improving the same template.
4. Or enter a new name under Version Control and click the copy button if you are making a separate template.
5. Edit labels, prompts, hidden references, and edges.
6. Run the clone from canvas.
7. Publish only when outputs are correct.

Recommended launch approach:

- Clone clean/simple templates first.
- Use `PAPARAZZI`, `RAVEN`, or `JEANS` style graphs as baselines.
- Keep branch-heavy templates like `ARMORED TRUCK`, `GAS STATION`, and `UNBOXING` in draft until each branch is audited.

## Put Working Templates Live And Keep Bad Ones Draft

Use `/app/lab/canvas`:

1. Select the template.
2. Select the version.
3. Confirm `Readiness` is clean.
4. Run it with real inputs.
5. Click `Publish Version Live`.

Use `/admin/templates` for a quick overview:

- It shows templates, version counts, live version, node counts, edge counts, and output counts.
- The graph/canvas icon opens the editable graph.
- The audit icon opens audits.

Important: publishing is per version. You do not delete bad versions. Keep them draft by leaving `is_active = false`.

## Change Template Description

Today, the create form lets you set the initial description.

The backend already supports updating descriptions with `admin-template-workbench` action `update_template`, but the current canvas UI does not expose a clean edit form for existing template descriptions.

For launch, either:

- Set the description correctly when creating the draft.
- Or update it through Supabase/admin tooling using the template ID.

The description shown to customers should live on `fuse_templates.description`, not inside prompts.

## Change Preview / Cover Media

Current behavior:

- `lab-template-catalog` picks a curated hardcoded cover for a few templates.
- Otherwise it pulls a cover from recent complete jobs.
- There is no clean admin UI field for `preview_url`.

Practical launch workflow:

1. Run the template from canvas with polished inputs.
2. Let that successful output become the recent cover.
3. For key launch templates, add curated covers in `lab-template-catalog` if you need deterministic media.

Better long-term fix:

- Add explicit template metadata fields such as `preview_url` and `preview_asset_type`.
- Add admin UI controls to upload/select the preview.
- Make the catalog prefer explicit metadata before recent job outputs.

## Logo, Font, And Video Descriptions

Current reality:

- Logo is usually a User Upload node or Hidden Reference node.
- Font is not a first-class template setting yet.
- Video descriptions/captions are not a first-class template setting yet unless they are baked into prompts or added by a specific generation/edit step.

How to handle it today:

- For customer-provided logos, create a `User Upload` node named `Logo` with slot key `logo`.
- For fixed brand/template logos, create a `Hidden Reference` or `Internal Lock` node with a sample/reference URL.
- Mention font/style directly in the image/video prompt if the model is rendering text.
- Add descriptions by writing them into the prompt for the relevant image/video step.

Better long-term fix:

- Add template-level fields for:
  - `brand_logo_url`
  - `font_family`
  - `caption_text`
  - `caption_style`
  - `preview_url`
  - `launch_status`
- Add a dedicated admin metadata panel so non-engineers are not editing node prompts for basic marketing metadata.

## Screen Recording Script For The Client

Record this exact flow:

1. Open `/admin/templates`.
2. Say: "This is the template workbench. Live templates have an active version; drafts stay internal."
3. Open `/app/lab/canvas`.
4. Create a draft template.
5. Show the lanes:
   - User Uploads
   - Hidden References
   - Internal Locks
   - Image Steps
   - Video Steps
6. Add/rename upload nodes:
   - Garment
   - Logo
   - Product Image
7. Add a hidden reference URL.
8. Edit an image prompt.
9. Edit a video prompt.
10. Connect nodes with target params.
11. Run the template.
12. Show the generated outputs.
13. Publish the version live.
14. Return to `/admin/templates` and show the live version.

Keep the video short. Do not explain database internals unless asked.

## Launch Checklist

For each template:

- Name is final.
- Description is not placeholder.
- User Upload nodes are correctly labeled and capped to real customer inputs.
- Output branches can differ from the upload count when the workflow needs multiple deliverables from the same input.
- Hidden reference images are optional per branch and are never exposed as customer uploads.
- Every image/video step has a prompt.
- Every generation node has incoming sources.
- Final outputs are explicitly marked as deliverables.
- Canvas run completes.
- Output visually matches the template promise.
- Broken versions remain draft.
- Best version is published live.

## Common Failure Modes

Too many uploads shown to customers:

- Some Weavy `user_input` nodes should be `Hidden Reference` or `Internal Lock`.

Template runs but output is missing:

- The final image/video step may not be checked as `Expose as final deliverable`.

Video step fails:

- Check that it has an incoming edge from an image node.
- Most video nodes should receive `start_frame_image`.

Scene keeps changing:

- Add or repair hidden reference nodes.
- Tighten prompts around preserving the scene.

Logo applies everywhere:

- Split the logo branch into a separate image step.
- Be explicit about where the logo should appear.

Template is visible before it is ready:

- You published the version. Clone/fix in a new draft and only publish when validated.
