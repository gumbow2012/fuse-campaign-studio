-- Tighten GAS STATION upload slots so the bulk runner maps top/bottom garments predictably.
update public.nodes
set prompt_config = coalesce(prompt_config, '{}'::jsonb) || jsonb_build_object(
  'editor_mode', 'upload',
  'editor_slot_key', 'top-garment',
  'editor_label', 'Top Garment',
  'editor_expected', 'image'
)
where id = '555255a4-b657-4cc9-a0b1-f3e502e759d9';

update public.nodes
set prompt_config = coalesce(prompt_config, '{}'::jsonb) || jsonb_build_object(
  'editor_mode', 'upload',
  'editor_slot_key', 'bottom-garment',
  'editor_label', 'Bottom Garment',
  'editor_expected', 'image'
)
where id = 'df106ede-153c-4f95-92ae-b0292f096bb2';

update public.nodes
set prompt_config = coalesce(prompt_config, '{}'::jsonb) || jsonb_build_object(
  'editor_mode', 'upload',
  'editor_slot_key', 'logo',
  'editor_label', 'Logo',
  'editor_expected', 'image'
)
where id = '14431b5d-6adc-4bb5-91b5-7564c0fdd528';

-- UGC MIRROR: remove stale sample-logo input path and genericize prompts.
delete from public.edges
where source_node_id = 'af3a91e7-3ade-404b-9d33-7c57e3cab93c'
  and target_node_id = '094e2234-10e1-4ba2-a73b-3f7813a41e7d';

update public.nodes
set prompt_config = (coalesce(prompt_config, '{}'::jsonb) - 'sample_url') || jsonb_build_object(
  'weavy_exposed', false,
  'editor_mode', 'workflow',
  'editor_label', 'Internal Deprecated Sample'
)
where id = 'af3a91e7-3ade-404b-9d33-7c57e3cab93c';

update public.nodes
set prompt_config = jsonb_set(
  coalesce(prompt_config, '{}'::jsonb),
  '{prompt}',
  to_jsonb($ugc_front$
Replace the subject's visible front outfit with the uploaded front garments set exactly as provided. Preserve the uploaded colors, graphics, proportions, and fabric behavior. Remove any belt, bag, logo, or extra accessory that is not present in the uploaded outfit. Keep the mirror scene realistic and grounded.
$ugc_front$::text),
  true
)
where id = '094e2234-10e1-4ba2-a73b-3f7813a41e7d';

update public.nodes
set prompt_config = jsonb_set(
  coalesce(prompt_config, '{}'::jsonb),
  '{prompt}',
  to_jsonb($ugc_back$
Show the subject turned around recording on her phone while wearing the uploaded back garments set exactly as provided. Preserve the uploaded colors, graphics, proportions, and fabric details. Do not invent any extra logo, bag, jacket, or accessory that does not exist in the uploaded outfit.
$ugc_back$::text),
  true
)
where id = 'd88e8b42-69fa-4040-a2af-0196310aab62';

update public.nodes
set prompt_config = jsonb_set(
  coalesce(prompt_config, '{}'::jsonb),
  '{prompt}',
  to_jsonb($ugc_out1$
A realistic handheld mirror selfie video filmed on a phone in a modern living room. The subject wears the uploaded front garments exactly as provided, with no added logo, no headband, and no extra accessory. Keep the outfit colors, graphics, fit, and fabric behavior faithful to the uploaded garments. Natural handheld movement, real indoor lighting, and no stylized fashion-editorial changes.
$ugc_out1$::text),
  true
)
where id = '0c30f76a-9ea7-4320-a110-38d328f68d8c';

update public.nodes
set prompt_config = jsonb_set(
  coalesce(prompt_config, '{}'::jsonb),
  '{prompt}',
  to_jsonb($ugc_out2$
A realistic handheld mirror selfie video filmed on a phone in a modern living room. The subject is turned around wearing the uploaded back garments exactly as provided. Do not add any extra logo, bag, or back graphic that is not present in the uploaded garments. Keep the scene casual, natural, and true to a home mirror outfit check.
$ugc_out2$::text),
  true
)
where id = '1a56fd4e-fb1e-4215-9bcb-5054b195df05';

update public.nodes
set prompt_config = jsonb_set(
  coalesce(prompt_config, '{}'::jsonb),
  '{prompt}',
  to_jsonb($ugc_out3$
A realistic handheld mirror selfie video filmed on a phone in a modern living room. The subject wears the uploaded front garments exactly as provided. Focus on authentic fit, fabric texture, and movement. Do not invent or overlay any extra logo, emblem, bag, or accessory that is not present in the uploaded garments.
$ugc_out3$::text),
  true
)
where id = '857c5417-74e2-44a2-a8ec-9c143e97ee24';

-- UNBOXING: remove stale sample-garment node from execution and feed the true uploaded garments into the scene seed.
delete from public.edges
where source_node_id = '320efb5a-efb6-4779-8d36-42f121a3fde2'
  and target_node_id in (
    '108f8176-c041-49d4-a0b4-33a539a2bd3d',
    '29404983-5d49-4fd1-a55d-f7f1928e9824',
    'a940c8b6-313c-49dc-9442-1e90cadbf5d3',
    'd157cd7b-6e90-4483-b95e-8e23bfad6792'
  );

update public.nodes
set prompt_config = (coalesce(prompt_config, '{}'::jsonb) - 'sample_url') || jsonb_build_object(
  'weavy_exposed', false,
  'editor_mode', 'workflow',
  'editor_label', 'Internal Deprecated Sample'
)
where id = '320efb5a-efb6-4779-8d36-42f121a3fde2';

insert into public.edges (id, version_id, source_node_id, target_node_id, mapping_logic)
select gen_random_uuid(), '6f601a6b-b4c5-46fc-8f07-34d89f04c49d', '0bb488cd-0302-4e52-ba8e-0b8486d15c4b', '94599997-1b7d-4f0a-8539-256b6ce10f68', '{"target_param":"image_3"}'::jsonb
where not exists (
  select 1 from public.edges
  where version_id = '6f601a6b-b4c5-46fc-8f07-34d89f04c49d'
    and source_node_id = '0bb488cd-0302-4e52-ba8e-0b8486d15c4b'
    and target_node_id = '94599997-1b7d-4f0a-8539-256b6ce10f68'
    and mapping_logic->>'target_param' = 'image_3'
);

insert into public.edges (id, version_id, source_node_id, target_node_id, mapping_logic)
select gen_random_uuid(), '6f601a6b-b4c5-46fc-8f07-34d89f04c49d', '6b7b9e07-67c8-4abb-8a60-3048cb2dda24', '94599997-1b7d-4f0a-8539-256b6ce10f68', '{"target_param":"image_4"}'::jsonb
where not exists (
  select 1 from public.edges
  where version_id = '6f601a6b-b4c5-46fc-8f07-34d89f04c49d'
    and source_node_id = '6b7b9e07-67c8-4abb-8a60-3048cb2dda24'
    and target_node_id = '94599997-1b7d-4f0a-8539-256b6ce10f68'
    and mapping_logic->>'target_param' = 'image_4'
);

update public.nodes
set prompt_config = jsonb_set(
  coalesce(prompt_config, '{}'::jsonb),
  '{prompt}',
  to_jsonb($unbox_scene$
Recreate the kitchen scene, camera framing, lighting, and subject identity from IMAGE 1. Replace the reference wardrobe with the uploaded outfit set from the provided garment inputs, preserving their colors, graphics, and proportions. Use the uploaded brand logo on the package only. Do not keep any leftover wardrobe, logo, or product details from the reference scene.
$unbox_scene$::text),
  true
)
where id = '94599997-1b7d-4f0a-8539-256b6ce10f68';

update public.nodes
set prompt_config = jsonb_set(
  coalesce(prompt_config, '{}'::jsonb),
  '{prompt}',
  to_jsonb($unbox_wear$
Create a photoreal UGC kitchen scene with the subject wearing the uploaded top and bottom garments exactly as provided. Preserve the uploaded garment colors, graphics, fit, and fabric behavior. No backend sample garment, no invented hoodie, and no extra logo beyond the uploaded brand mark when it belongs on packaging.
$unbox_wear$::text),
  true
)
where id in (
  '7c6a02d1-49c3-4d91-bc08-2f335cd414ae',
  '108f8176-c041-49d4-a0b4-33a539a2bd3d'
);

update public.nodes
set prompt_config = jsonb_set(
  coalesce(prompt_config, '{}'::jsonb),
  '{prompt}',
  to_jsonb($unbox_pkg$
Maintain the kitchen scene and subject identity while showing a realistic branded shipping package that uses the uploaded brand logo. The package and the visible product inside must correspond only to the uploaded garments. Do not introduce any backend sample product, backend logo, or extra garment not present in the user inputs.
$unbox_pkg$::text),
  true
)
where id in (
  'a940c8b6-313c-49dc-9442-1e90cadbf5d3',
  'd157cd7b-6e90-4483-b95e-8e23bfad6792',
  '1d62b25d-31da-4063-bc6c-ffb63fd4ecf3',
  'c2ff5137-3bb4-48e4-a58a-18c89a8adf1b',
  '4398ec71-f7ef-474e-8fea-9e333877a0a8',
  '9a6259d2-64c2-43e0-83b1-ed6edc7749ad',
  'f54247b9-20ba-4edb-b991-49f1bd4c5331',
  '29404983-5d49-4fd1-a55d-f7f1928e9824'
);

update public.nodes
set prompt_config = jsonb_set(
  coalesce(prompt_config, '{}'::jsonb),
  '{prompt}',
  to_jsonb($unbox_video_pkg$
A realistic handheld iPhone UGC video in the same kitchen scene. The package must use the uploaded brand logo, and any visible product must match the uploaded garments only. Do not reveal or retain any backend sample garment or backend logo.
$unbox_video_pkg$::text),
  true
)
where id in (
  '14d8bb6b-fb86-4475-9025-e13ba04dbe01',
  '74461cb9-5415-445d-b9e6-2499182b1cd9'
);

update public.nodes
set prompt_config = jsonb_set(
  coalesce(prompt_config, '{}'::jsonb),
  '{prompt}',
  to_jsonb($unbox_video_outfit$
A realistic handheld iPhone UGC video in the same kitchen scene. The subject must wear and present the uploaded garments exactly as provided, with accurate colors, graphics, and fabric behavior. Do not swap in any backend sample hoodie, shirt, shorts, or extra logo.
$unbox_video_outfit$::text),
  true
)
where id in (
  '4f9ab145-5d45-460e-bd85-e16b6b2fd5cc',
  '893c1b85-7281-4fc5-916d-841415a3f4d0',
  'd18d619b-fdaf-490c-be00-aebf2ef34c01',
  'f600a1e2-37a4-41f4-9c56-6c561dc723a2'
);
