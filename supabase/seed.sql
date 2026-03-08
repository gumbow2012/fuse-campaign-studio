-- =============================================================================
-- FUSE CAMPAIGN STUDIO — Seed Data
-- Run this in Supabase SQL Editor after DB reset to restore templates.
-- The worker resolves R2 keys as: name.toLowerCase().replace(/ /g,'_') + '_template.json'
-- So "RAVEN" → raven_template.json, "UGC MIRROR" → ugc_mirror_template.json, etc.
-- =============================================================================

INSERT INTO public.templates
  (name, description, category, output_type, estimated_credits_per_run,
   is_active, input_schema, tags)
VALUES
  (
    'RAVEN',
    'Transform product images into cinematic video content with the Raven style.',
    'Editorial',
    'video',
    50,
    true,
    '[
      {"key":"product_image","label":"Product Image","type":"image","required":true},
      {"key":"prompt","label":"Scene Prompt","type":"text","required":false}
    ]'::jsonb,
    ARRAY['video','editorial','product']
  ),
  (
    'UGC MIRROR',
    'User-generated content style — mirror shot with your product.',
    'UGC',
    'video',
    50,
    true,
    '[
      {"key":"product_image","label":"Product Image","type":"image","required":true},
      {"key":"prompt","label":"Scene Prompt","type":"text","required":false}
    ]'::jsonb,
    ARRAY['ugc','video','mirror']
  ),
  (
    'PAPARAZZI',
    'Paparazzi-style candid shots that make your product look iconic.',
    'Street',
    'video',
    50,
    true,
    '[
      {"key":"product_image","label":"Product Image","type":"image","required":true},
      {"key":"prompt","label":"Scene Prompt","type":"text","required":false}
    ]'::jsonb,
    ARRAY['street','video','paparazzi']
  );

-- ── Make yourself admin ───────────────────────────────────────────────────────
-- After signing up, run this with YOUR email to grant admin access:
--
-- UPDATE public.user_roles
--   SET role = 'admin'
--   WHERE user_id = (SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL_HERE');
