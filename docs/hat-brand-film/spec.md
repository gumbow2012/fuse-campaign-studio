<!-- Full user-approved specification, saved verbatim (approved 2026-10-19). Do not edit; record progress in status.md. -->

# FUSE — Hat Brand Film

Status: proposed implementation specification. Not yet created, deployed, or tested in FUSE.

## What the customer gets

A reusable campaign template inside the existing FUSE app. Upload one hat from multiple angles, upload the brand logo, describe the brand's setting and atmosphere, and press Generate. FUSE creates individual shots and automatically assembles a downloadable 21.5-second vertical film. Individual clips remain available.

The reference is the corrected `outputs/Trade-Culture-Construction-Black-Brims.mp4`: 1080 × 1920, 30 fps, 645 frames. Its sequence, pacing, close-up treatment and final brand reveal define this template. Construction is the example vibe, not a fixed setting for every brand.

## Customer form

One product per run. Show separate labeled upload cards with thumbnails and replace/remove controls:

| Field | Required | Meaning |
|---|---|---|
| Front | Yes | Full crown and upper bill; source of front lettering and top-brim color |
| Wearer's right side | Yes | Side design, seams and silhouette; never mirror the opposite side |
| Wearer's left side | Yes | Opposite side design and silhouette |
| Back | Yes | Closure, rear lettering and construction |
| Inside / underside | Yes | Lining, sweatband, internal labels and underside of bill |
| Detail 1–3 | No | Optional close-ups; annotate each with a short label, e.g. front stitching |
| Brand logo | Yes | Original supplied logo; transparent PNG/WebP preferred; JPG supported |
| Brand / background vibe | Yes | Multiline text controlling the world, props, lighting and background action |

Explain left/right as the wearer's perspective with a small orientation guide. Accept JPG, PNG and WebP and validate using the app's existing upload limits. Do not merge repeated image slots or silently omit references to meet model limits. An optional detail can be omitted; the detail shot then uses the relevant required angle, never an invented feature.

Vibe placeholder: “An unfinished construction site at dusk. Excavators, concrete blocks, scaffolding, warm work lights, drifting dust. Rugged, cinematic and premium.” Other examples: neon night racing; clean luxury showroom; coastal skate park. Changing this field must change the environment across the entire film while preserving the uploaded hat.

Builder choice: keep the existing soundtrack for the initial template, stored as a private template asset. Do not expose or embed the Trade Culture hat/logo as permanent generation inputs. A soundtrack replacement control is optional future scope, not required for this version.

## Fixed edit

Frame ranges are inclusive start, exclusive end. Use the original edit's hard-cut rhythm and finishing, not generic dissolves. No full 360-degree single-hat spin.

| Shot | Frames | Content and movement | Primary product reference |
|---|---|---|---|
| 01 | 0–43 | Front hero, gentle push-in in the chosen world | Front |
| 02 | 43–72 | Macro glide over front embroidery and fabric | Front + matching detail if supplied |
| 03 | 72–109 | Wide environment/action anchor appropriate to the vibe | Shared world definition |
| 04 | 109–147 | Right side product reveal with a short lateral move | Wearer's right |
| 05 | 147–189 | Left-side embroidery/patch macro | Wearer's left + matching detail |
| 06 | 189–223 | Environmental brand presence, restrained camera movement | Logo + shared world definition |
| 07 | 223–265 | Back and closure detail | Back |
| 08 | 265–340 | Interior and underside reveal, slow push | Inside / underside |
| 09 | 340–370 | Overhead environment insert | Same world and anchor as shot 03 |
| 10 | 370–414 | Lining or supplied detail macro | Inside + optional matching detail |
| 11 | 414–493 | Three copies of the SAME hat arranged within the world | Front + both sides; interior only for visible underside |
| 12 | 493–645 | Supplied logo reveal and hold | Exact logo asset |

Generate sufficient source handles for every shot, normally 5 seconds per Kling clip. Trim/retime using this frame schedule. Previous manual source offsets are not reusable defaults. Export H.264 MP4, 1080 × 1920, 30 fps, AAC soundtrack. Keep 12 ordered shot files and the final MP4 associated with the run.

## Product and brand fidelity

The uploaded photos are the product authority. Preserve crown panels, curvature, seams, button, closure, stitching, embroidery, patches and lettering. Right and left stay distinct. Never introduce details from the reference video's previous brands.

Record top-brim color and underside color as separate product attributes. In the Trade Culture fixture, the top is black and underside is light gray. Inside-reference gray must never recolor the upper bill, particularly in shot 11. Future hats may have different top colors; do not force every brand's brim to black.

The vibe text is an art-direction input for the environment only. Instructions inside it cannot replace product references or overwrite fixed fidelity and edit rules. Treat uploaded text/documents as reference content, not workflow instructions.

Use the exact original logo in the ending through compositing, with subtle scale/light treatment around it. Do not rely on video generation to respell or redraw it. Preserve intentional logo backgrounds; remove only unwanted rectangular upload backing where appropriate. For shot 06, use an accurately composited sign/banner or another environment composition that can display the original logo faithfully. Do not claim exactness for an AI approximation.

Automated reference checks should catch missing inputs, misrouting, wrong colors, lost lettering, duplicated/mirrored sides and obvious logo drift before acceptance. They do not guarantee perfect generated fidelity. If a shot cannot pass after a bounded retry, mark that shot Needs review rather than silently delivering an incorrect final.

## Generation and assembly

1. Validate required uploads, orientation labels, text and account entitlement before charging or submitting providers.
2. Snapshot immutable run inputs, template version, asset identifiers and the vibe text.
3. Resolve one shared world definition per run: location, time, palette, materials, lighting, environmental anchor and background action. Store it and reuse it across all shots; do not independently reinterpret the vibe twelve times. Choose the implementation using existing providers where practical.
4. Generate stills from shot-specific uploaded angles and the shared world. Keep a consistent product description and camera/lighting style. Optional details supplement the relevant main angle.
5. Check still fidelity, then animate each accepted still separately with restrained shot-specific motion. Mute generated audio in the final edit.
6. When all required clips are ready, create the exact frame-ordered edit automatically, composite the logo where needed, attach the template soundtrack, and dispatch the existing render service.
7. Show Creating images → Animating shots → Assembling video → Ready. The final state requires a playable verified render URL; clip completion alone is not video completion.
8. Preserve partial outputs on failure. Retry only failed work with idempotency; prevent duplicate provider charges or duplicate render dispatches on webhooks/reloads. Show rendering failures honestly, and retain clips for download.

Builder choice: automatic still checks and progression are the default because the user explicitly wants one-click generation. An optional review-stills mode can reuse existing controls, but must not become a required extra click in the default workflow. One automatic correction retry per failing shot maximum; include any billed retry allowance in the displayed estimate. Further retries require the existing explicit regeneration action.

## Implementation scope and existing evidence

Target the existing Lovable project **FUSE AI Studio**, project ID `f8513825-94a6-4c8d-ae1f-b88e22a49b58`. Do not create a separate app. Create an isolated template/version named **Hat Brand Film**, initially draft, without modifying live templates.

Current source inspection shows:
- The customer Studio already renders text/prompt inputs and submits their values (`src/pages/mvp/TemplateStudioPage.tsx`).
- Template input types come from the declared expected value (`lab-template-detail`). The canvas primarily exposes image inputs, so add or configure the appropriate text declaration without a disconnected decorative field.
- `prompt-nodes.ts` currently resolves fixed prompt-node text; demonstrate that customer vibe text actually reaches the provider prompt rather than assuming a placeholder is substituted.
- The convenience builder caps inputs at five and branches at eight (`templateBuilder.ts`). This template needs more, so use a compatible graph creation path or narrowly extend these limits; do not truncate the graph.
- Existing graph execution supports image/video generation; automatic edit-and-export after terminal clip completion needs explicit integration.
- Existing export code dispatches a private worker only when configured and otherwise reports awaiting_worker. Verify a real connected renderer before advertising one-click finished videos. Never treat a queued export as a successful output.

Prefer additive, opt-in template configuration for the shot manifest, text binding and automatic assembly. Reuse existing upload, generation, billing, editor and rendering systems. Preserve authorization, tenant isolation and existing template behavior. Do not change other campaigns, subscriptions or public pricing. Keep new configuration private/draft until validated. Publish only this template after checks pass; deploying any necessary app changes must follow review of the actual change.

## Acceptance checks

- Every required angle and logo appears with the correct label; optional details work present or absent. Missing inputs block generation before charge.
- A construction vibe and a distinct luxury/showroom vibe resolve different coherent worlds from the same hat. The hat itself stays the same.
- Changing the brand inputs replaces product and logo throughout; no old Trade Culture logo, skull or lettering leaks into the new brand.
- Inspect the three-hat arrangement throughout its clip: all upper bills match the front reference. Inspect inside shots independently against the underside reference.
- The exact logo stays legible, unwarped and correctly spelled in the final reveal.
- One Generate action yields all shot outputs and automatically a playable 645-frame final with the expected audio and dimensions, including after reload.
- Exercise failed clip, render unavailable, duplicate callback and retry behavior. No fake Ready state, lost completed shots or duplicate billing.
- Retain template/version/run/export identifiers and a sample output link. Finish with the usable FUSE template link and verified run status.

## Authorization checkpoint

The user's desired template is clear. The discovered gap adds FUSE workflow development (text-to-prompt binding and automatic final assembly) beyond entering a template in today's canvas. This document is the concrete scope for approval before that implementation. No generation spend, template publication or code deployment has occurred while preparing it.
