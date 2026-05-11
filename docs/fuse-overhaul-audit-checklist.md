# Fuse Overhaul Audit Checklist

Use this to verify the project is on the right path before user testing.

## Closed or Mostly Closed

- [ ] Non-admin users cannot see hidden prompts, hidden reference assets, internal nodes, or provider step details.
- [ ] Template runner cards use the 9:16 visual card grid and do not repeat filler preview copy.
- [ ] Selecting a runner template shows only the required upload slots and run controls.
- [ ] Hidden guide/reference uploads save to Supabase storage and come back as asset UUIDs on the template nodes.
- [ ] Starter membership is configured as $25 in app config and shared Stripe plan metadata.
- [ ] Subscription checkout and credit-pack checkout both support Stripe promotion codes.
- [ ] Credit packs/top-ups can create Checkout Sessions and the webhook credits the user after paid checkout.
- [ ] The admin template builder starts at the top of the canvas page.
- [ ] New template creation uses name -> input slots -> output count -> hidden guides -> prompts.
- [ ] The input slot picker uses controlled labels such as Top Garment, Bottom Garment, Logo, Head Accessory, Footwear, Model Reference, Scene Reference, and Product Image.
- [ ] Blank draft canvas is not exposed in the creation UI.
- [ ] "Reference direction" copy is gone; the builder uses hidden guide language.
- [ ] Manage existing templates sits below create-new, not beside it in a cramped trailing panel.
- [ ] Orbitron is installed locally and wired as the display/brand font.
- [ ] The normal admin template page no longer links to the legacy HAR/Weavy importer.
- [ ] New draft versions start in Testing status and cannot be published until an admin canvas run completes.

## Needs Manual QA

- [ ] Create one fresh draft from the new builder with 3 inputs and 1 output.
- [ ] Confirm the created canvas has one user-upload node per selected slot.
- [ ] Confirm every selected input is wired into the generated image node with a meaningful target param.
- [ ] Confirm the hidden guide image appears as a hidden/reference node with an asset UUID.
- [ ] Publish the new version and run it from `/app/templates` as admin.
- [ ] Run the same live template as a non-admin test user and confirm hidden internals are not visible.
- [ ] Buy a credit pack in Stripe test mode and confirm `credits_balance` increases.
- [ ] Run a subscription checkout with a promo code and confirm Stripe accepts it.
- [ ] Test mobile widths for `/app/templates` and `/app/lab/canvas`.

## Still Remaining

- [ ] Final logo/favicon asset approval beyond the interim `/fuse-icon.svg` mark.
- [ ] A cleaner admin-edit surface for template description and preview/sample output media.
- [ ] Create a real live `$25/month` Starter price in Stripe and set `STRIPE_STARTER_PRICE_ID_LIVE`; current live Starter fallback is still `$49/month` and checkout is blocked to avoid overcharging.
- [ ] Full live Stripe webhook smoke test with the corrected live Starter price ID.
- [ ] Decide whether to delete the hidden legacy HAR/Weavy importer route entirely.

## HAR Note

HAR means HTTP Archive: a Chrome DevTools Network export. In this app it only exists as a legacy bulk importer for old Weavy recipe-run traffic. It is no longer surfaced from the normal admin template page.
