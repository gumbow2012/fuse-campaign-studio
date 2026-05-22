# FUSE Chat Handoff - 2026-05-22

This is a condensed handoff for continuing the FUSE work in a fresh chat.

## Project

- App: FUSE Campaign Asset Studio
- Repo: `/Users/utaupeia/Documents/New project/fuse-campaign-studio`
- Production site: `https://fuse-us.com`
- Backend: Supabase project `ykrrwgkxgidoavtzcumk`
- Payments: Stripe Checkout/subscriptions/credit packs
- Generation: FAL image/video models through Supabase Edge Functions

## Operating Rules

- Production has live paid users. Do not guess; inspect logs/data, patch narrowly, test, and state exactly what was verified.
- Hidden reference images and prompts must never be visible to non-admin users.
- Public outputs should use generic labels like `Output 1`, not provider/model names.
- Template run UX should show the template name while running.
- User-facing upload placeholders and outputs are 9:16 vertical.

## Completed Major Work

- Admin-only hidden references and prompt protection.
- Template builder overhaul into setup/branches flow.
- Draft builder requires a template name and greys out next/create actions when needed.
- Hidden references upload into Supabase and return UUIDs/URLs for graph use.
- Public templates page uses card grid, 9:16 visuals, input/output counts, and no redundant text.
- Template cards ordered with `GRILLZZZZ` first, then most-to-least expensive.
- Placeholder icons added for shirt/top/garment, pants, logo, face, grillz, car, accessory.
- Header logo/favicon assets restored.
- Orbitron/font styling added.
- Starter plan updated to `$25/mo`, 3,000 credits. Starter Stripe price ID provided: `price_1TZc2hAWgNdlZ1x0yUZUWLE7`.
- Credit packs/top-ups and plan credits wired through Stripe webhook/ledger.
- Discount support added through Stripe Checkout promo code entry.
- Google login added through Supabase OAuth, alongside email auth.
- Templates page can be viewed logged out; purchase/run requires sign-in.
- Feedback card added to output audit flow.
- Storage image transformations were removed from the runner path to avoid Supabase transformation quota overages.
- Runner now skips bad pending/orphan steps instead of killing an entire job.
- Catalog counts/pricing now count connected runnable nodes.

## Latest Code Changes In Progress

Files touched:

- `src/components/mvp/RunFeedbackCard.tsx`
- `src/pages/mvp/TemplateStudioPage.tsx`
- `supabase/migrations/20260522211500_fix_ugc_mirror_grunge_prompt_wiring.sql`
- `supabase/migrations/20260522213000_fix_amazon_delivery_logo_video_prompts.sql`
- `docs/audits/ugc-mirror-grunge-path-audit-2026-05-22.md`
- `docs/audits/amazon-delivery-logo-feedback-audit-2026-05-22.md`

Behavior changed:

- Feedback submit button now says `Submit feedback`.
- Feedback text clears after a successful submit.
- Success toast says `Feedback submitted`.
- Run toast now says the template name, for example `RAVEN queued` / `RAVEN is running`.

## UGC Mirror Grunge Output 4 Issue

Feedback job: `aaeceb23-7e92-4e2b-b461-cf0fdd7a36a2`

Issue: Output 4 used unrelated pink clothing.

Root cause:

- The live graph had hardcoded prompt text for a pink zip-up hoodie, leggings, and headband.
- Bottom garment was not wired into the top/full outfit branches.

Fix:

- Production migration `fix_ugc_mirror_grunge_prompt_wiring` applied.
- Bottom garment now feeds top image branches as `bottom_garment_image`.
- Hardcoded pink outfit prompts replaced with prompts preserving uploaded top/bottom garments.
- Orphan exposed video branch hidden.

Audit doc:

- `docs/audits/ugc-mirror-grunge-path-audit-2026-05-22.md`

## Amazon / Delivery Guy Logo Issue

Feedback job: `c29ec5f0-3d06-48bb-a0fd-cf07004688ce`

Issue: second video did not preserve/apply the uploaded logo on the bag.

Root cause:

- Upstream image branch had the uploaded logo, but two video prompts did not explicitly preserve the printed logo during package motion.

Fix:

- Production migration `fix_amazon_delivery_logo_video_prompts` applied.
- The two package-rip video nodes now explicitly preserve the printed logo from first frame to last frame.

Audit doc:

- `docs/audits/amazon-delivery-logo-feedback-audit-2026-05-22.md`

## Known User/Billing Context

Emails that came up in audits:

- `taupehue@gmail.com`: admin account used for testing.
- `boogimus@gmail.com`: paid Starter user previously reported run failures.
- `help@sotforever.com`: correct customer email spelling.
- `gumbow2012@gmail.com`: legacy/comped admin-like balance context; do not assume this should be copied to normal users.

Known billing issue:

- Some users purchased Starter but initially had no credits. Need webhook/ledger audits whenever this is reported.
- A good audit checks Stripe event -> `billing_events` -> `credit_ledger` -> `profiles.credits_balance`.

## Deployment Checklist For Next Agent

1. Run production verification SQL for the two migrations.
2. Run `npm test`.
3. Run `npm run build`.
4. Commit and push to `main`.
5. State exactly what was deployed and what still needs visual generation validation.

## Things Not To Break

- Do not expose hidden refs/prompts to non-admin users.
- Do not show provider/model names on public output cards.
- Do not globally rewrite the runner unless the failure is proven global.
- Do not create new Stripe price/product IDs unless needed; Stripe prices used in transactions cannot be edited.
- Do not re-enable Supabase image transformations in storage URLs.
