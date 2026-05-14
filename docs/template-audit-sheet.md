# FUSE Template Audit Sheet

Use this as the working contract while dialing templates in.

Rules:
- `User uploads` are always dynamic. They should never fall back to demo media unless an admin intentionally attaches a default asset for a smoke run.
- `Hidden references` are built-in scene assets that stay fixed unless we intentionally replace them.
- If Supabase has more raw `user_input` nodes than the `User uploads` count below, the extras should be demoted to hidden refs.
- The Weavy recipe is the source of truth for step count and flow shape.

## Validation Runs

### 2026-05-13 Codex Branch Mapping Smoke

- Template: `Codex Branch Mapping Smoke 2026-05-13T20-46-35`
- Version: `03d347b2-7d37-4a7b-b6a8-b2bf915c42e9`
- Job: `2aa92fa1-851e-484d-b93c-bc28f3aef283`
- Status: `complete`
- Graph check: `5` user upload inputs, `0` hidden reference uploads, `8` image branches, `8` video branches.
- Branch wiring check: image branches map to Top Garment, Bottom Garment, Logo, Head Accessory, and Footwear instead of all mapping to the first upload.
- Runner check: all `8` image steps and all `8` video steps completed.
- Asset shape check: generated images are `768 x 1376`, matching the required 9:16 output direction.
- Visual verdict: `prompt drift`
- Reason: the smoke used existing generated assets as seeded test inputs, so the workflow proved the graph and runner path, but several visual outputs were not publishable brand outputs. Some branches generated generic fashion/ad imagery instead of cleanly preserving the intended upload category.
- Publish decision: do not publish this smoke template. It exists only to verify the builder, graph creation, default test assets, and runner automation path.

## Count Summary

| Template | User uploads | Hidden refs | Weavy image steps | Weavy video steps | Current raw Supabase `user_input` nodes |
| --- | --- | ---: | ---: | ---: | ---: |
| AMAZON GUY | 2 | 5 | 5 | 6 | 7 |
| ARMORED TRUCK | 2 | 2 | 15 | 11 | 4 |
| BLUE LAB | 3 | 6 | 6 | 6 | 9 |
| DOCTOR | 1 | 3 | 8 | 8 | 4 |
| GARAGE | 2 | 2 | 13 | 9 | 4 |
| GAS STATION | 3 | 2 | 15 | 11 | 5 |
| ICE PICK | 2 | 8 | 9 | 8 | 10 |
| JEANS | 1 | 1 | 12 | 7 | 2 |
| PAPARAZZI | 1 | 1 | 1 | 1 | 2 |
| RAVEN | 1 | 3 | 3 | 3 | 4 |
| SKATEPARK | 3 | 6 | 8 | 6 | 9 |
| UGC MIRROR | 2 | 1 | 2 | 3 | 3 |
| UNBOXING | 3 | 2 | 12 | 6 | 5 |

## Template-by-Template

### AMAZON GUY
- User uploads: `Logo`, `Garment`
- Hidden refs: `5`
- What it is: delivery-guy scene pack. Logo gets applied to package/bag shots. Garment gets applied to hoodie/clothing shots. Then each still becomes a porch or hallway video.
- Main flow:
  - `Ref package shot + Logo -> "place uploaded logo on the package subject is holding" -> branded still`
  - `Branded still -> "knocks on door" -> video output`
  - `Branded still -> "rings door bells with right hand" -> video output`
  - `Ref delivery scene + Garment -> "remove hoodie replace with uploaded product" -> clothing swap still`
  - `Clothing swap still -> hallway / porch prompts -> more video outputs`
- Audit note: this one is prompt-fragile. The graph shape is straightforward, but the clothing-replacement prompts need to stay tightly matched to the actual scene.

### ARMORED TRUCK
- User uploads: `Logo`, `Garment`
- Hidden refs: `2`
- What it is: one master armored-truck fashion still branches into a large set of automotive detail stills and matching videos.
- Main flow:
  - `Garment + Logo + base armored-truck ref -> master campaign still`
  - `Master still -> hood logo detail -> video`
  - `Master still -> door armor logo detail -> video`
  - `Master still -> spare tire housing logo detail -> video`
  - `Master still -> wheel / skid plate / full-body / top-down variants -> videos`
- Audit note: this is a branch-heavy template. The first master still has to be right or the rest of the tree collapses.

### BLUE LAB
- User uploads: `Logo`, `Top Garment`, `Bottom Garment`
- Hidden refs: `6`
- What it is: blue-lit warehouse / packaging / uniform scenes. One branch handles branded shipping package shots. Other branches handle workers/models wearing the uploaded outfit.
- Main flow:
  - `Ref package scene + Logo -> "replace package logo with uploaded logo" -> branded package still -> package video`
  - `Ref worker scene + Top Garment + Bottom Garment -> "remove subjects outfit and instead wear uploaded products" -> worker still -> worker video`
  - `Ref second warehouse scene + Top Garment + Bottom Garment -> outfit still -> second worker video`
- Audit note: user uploads should be only `3`. The remaining `6` imports are hidden scene refs. This is the clearest example of why raw Weavy imports should not all be exposed as uploads.

### DOCTOR
- User uploads: `Top Garment`
- Hidden refs: `3`
- What it is: a medical or tailoring-style staged scene where the same base subject gets turned into multiple prop-specific stills and videos.
- Main flow:
  - `Base styled still -> holding thread spool -> video`
  - `Base styled still -> holding scissors -> video`
  - `Base styled still -> holding measuring tape -> video`
  - `Base styled still -> stretching tape / leaning in -> more videos`
- Audit note: the prompt stack is doing most of the differentiation here. The reference scene has to remain locked while only props / pose details change.

### GARAGE
- User uploads: `Garment`, `Logo`
- Hidden refs: `2`
- What it is: oversized outfit in a garage environment with multiple closeups and one logo application branch.
- Main flow:
  - `Garment + garage ref -> "replace subject outfit with large oversized baggy jacket and pants" -> master outfit still`
  - `Master still + Garment -> closeup wearing product`
  - `Master still + Garment -> pants closeup`
  - `Master still -> face closeup / eye closeup`
  - `Eye or detail still + Logo -> logo detail still`
- Audit note: this one already reads like a sensible chain. Most of the work here is prompt cleanup and ensuring the logo only lands where intended.

### GAS STATION
- User uploads: `Garment 1`, `Garment 2`, `Logo`
- Hidden refs: `2`
- What it is: snowy gas-station scene pack with multiple body, face, and surveillance-like variants.
- Main flow:
  - `Garment 1 + Garment 2 -> "make subject wear uploaded products, hood off, hands by side..." -> base outfit still`
  - `Base still + Garment 1 -> face closeup`
  - `Base still -> logo removal / pants cleanup variants`
  - `Base still -> walking CCTV-style scene`
  - `Base still + rear scene ref -> back-view outfit still`
- Audit note: this one likely needs explicit mapping for which garment is top vs bottom. Right now the user-facing labels should stay generic unless you want to rename them.

### ICE PICK
- User uploads: `Top Garment`, `Bottom Garment`
- Hidden refs: `8`
- What it is: many fixed top-down / overhead / ice-environment compositions that all reuse the same clothing swap idea.
- Main flow:
  - `Ref scene 1 + Top Garment + Bottom Garment -> outfit still -> overhead video`
  - `Ref scene 2 + Top Garment + Bottom Garment -> outfit still -> top-down video`
  - `Ref scene 3 + Top Garment + Bottom Garment -> outfit still -> top-down video`
  - `Ref scene 4 + Top Garment + Bottom Garment -> outfit still -> low-angle ice video`
- Audit note: this template is mostly a scene-pack. Almost all complexity is hidden references.

### JEANS
- User uploads: `Bottom Garment`
- Hidden refs: `1`
- What it is: a denim detail system. One hero still branches into many macro and product-detail studies, then some of those become videos.
- Main flow:
  - `Jeans ref scene + Bottom Garment -> hero jeans still`
  - `Hero still -> waistband macro`
  - `Hero still -> zipper macro`
  - `Hero still -> design closeup`
  - `Hero still -> seam closeup / remove design / zipper position / remove logos variants`
- Audit note: very linear. Good candidate for early prompt-perfecting because the inputs are simple and the references are minimal.

### PAPARAZZI
- User uploads: `Garment`
- Hidden refs: `1`
- What it is: one shirt replacement still that feeds one paparazzi-style or hands-in-frame video.
- Main flow:
  - `Garment + hidden t-shirt scene ref -> "replace all t-shirts with uploaded black product..." -> styled still`
  - `Styled still -> taped-down t-shirt hands video`
- Audit note: this is the cleanest template. Best baseline for checking if the runner itself is behaving.

### RAVEN
- User uploads: `Garment`
- Hidden refs: `3`
- What it is: multiple gritty hoodie-drop / floor / handheld variants, each with its own video.
- Main flow:
  - `Ref scene 1 + Garment -> hoodie swap still -> hoodie-drop video`
  - `Ref scene 2 + Garment -> hoodie swap still -> handheld gritty video`
  - `Ref scene 3 + Garment -> hoodie swap still -> darker handheld video`
- Audit note: easy to audit visually because each branch is basically one still plus one video.

### SKATEPARK
- User uploads: `Top Garment`, `Bottom Garment`, `Accessory`
- Hidden refs: `6`
- What it is: skatepark fashion system with outfit, face, accessory, and environment coverage.
- Main flow:
  - `Ref scene + prior styled still -> locked scene image`
  - `Top Garment + prior styled still -> top-garment scene still`
  - `Bottom Garment + prior styled still -> bottom-garment scene still`
  - `Accessory + prior styled still -> accessory scene still`
  - `Still variants -> skatepark videos`
- Audit note: this one has many scene locks. Good template to compare side-by-side with Weavy because subtle rewiring mistakes are easy to miss.

### UGC MIRROR
- User uploads: `Garments Front`, `Garments Back`
- Hidden refs: `1`
- What it is: mirror-selfie outfit presentation, front and back.
- Main flow:
  - `Back garment + living-room ref -> oversized outfit mirror still -> two mirror videos`
  - `Previous still + Front garment -> turned-around / showing back still -> video`
- Audit note: the naming is a bit awkward but the graph is actually compact and understandable.

### UNBOXING
- User uploads: `Logo`, `Top Garment`, `Bottom Garment`
- Hidden refs: `2`
- What it is: heavily locked unboxing/kitchen scene with many scene-preserving logo and garment applications.
- Main flow:
  - `Scene refs -> master scene recreation`
  - `Master scene + Top Garment -> outfit-applied still`
  - `Styled still -> further locked scene variants`
  - `Styled still + Logo -> logo placement variants`
  - `Final stills -> unboxing videos`
- Audit note: this one is prompt-heavy and rigid. It needs visual auditing because the prompts are long and over-constrained.

## How To Use This With Images

For each template, send me:
- `1` screenshot of the original Weavy branch you want matched
- `1` screenshot or file of the built-in hidden ref that must stay
- `1` screenshot of the current bad output
- one sentence: `what is wrong`

Then I can adjust the exact step that drifted instead of guessing at the whole template.

Format to send me:

`TEMPLATE NAME`
- target branch: `Image 2` or `Video 3`
- hidden ref should be: `warehouse package scene`
- user upload should affect: `logo only` or `top garment only`
- wrong output: `it changed the whole scene`, `logo missing`, `pants changed`, `too many references`, etc.
