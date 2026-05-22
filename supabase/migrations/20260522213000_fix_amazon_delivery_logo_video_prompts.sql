-- Reinforce Amazon/Delivery Guy video branches that start from the logo-on-bag
-- package image. The video model was allowed to drift because these prompts
-- described the bag/rip action without explicitly preserving the printed logo.

UPDATE public.nodes
SET prompt_config = jsonb_set(
  prompt_config,
  '{prompt}',
  to_jsonb('Ultra-realistic handheld iPhone-style vertical video, 7-9 seconds. Start from the provided frame exactly. A delivery worker stands in an indoor hallway under soft overhead lighting holding the black plastic shipping bag at chest level. Preserve the uploaded logo already printed on the bag from the first frame through the final frame; do not remove, blur, replace, warp, or invent new bag branding. He rips the package open quickly using both hands, tearing the plastic naturally while the logo remains visible on the bag during the action. Keep the garment, bag, logo placement, lighting, and scene consistent with the start frame.'::text)
)
WHERE id = 'cf730b82-4211-4639-b7ba-b9d11d0bf2d5'::uuid
  AND version_id = '51c3b6c5-9b57-4d50-9b22-7be82c783427'::uuid;

UPDATE public.nodes
SET prompt_config = jsonb_set(
  prompt_config,
  '{prompt}',
  to_jsonb('Realistic handheld cinematic vertical video inside a dim indoor hallway with moody overhead lighting. Start from the provided frame exactly. A man wearing the delivery outfit stands centered holding the black plastic package. Preserve the uploaded logo already printed on the package from first frame to last frame; do not remove, blur, replace, warp, or invent new package branding. He quickly rips the package open with urgency, then pulls out the garment while the logo-bearing bag remains visually consistent with the start frame. Keep identity, clothing, package material, logo placement, and lighting stable.'::text)
)
WHERE id = '13c9da7a-1f00-4d96-b736-2c6406b8321c'::uuid
  AND version_id = '51c3b6c5-9b57-4d50-9b22-7be82c783427'::uuid;
