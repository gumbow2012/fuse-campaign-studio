-- Fix UGC Mirror Grunge branches that were copying hardcoded pink hoodie/leggings
-- language instead of preserving the uploaded garments. Hidden refs should guide
-- pose/composition only.

UPDATE public.nodes
SET prompt_config = jsonb_set(
  prompt_config,
  '{prompt}',
  to_jsonb('Create a realistic vertical UGC mirror outfit image using the uploaded top garment and uploaded bottom garment exactly as supplied. Preserve the uploaded garments'' colors, graphics, logos, fit, fabric texture, seams, and proportions. Use hidden guide/reference images only for pose, framing, camera angle, and casual mirror-selfie composition. Do not copy clothing from the guide image. Do not introduce pink hoodie, leggings, headband, leather jacket, unrelated logos, or any garment that was not uploaded. Keep the outfit coherent on one subject with natural indoor lighting and realistic phone-camera detail.'::text)
)
WHERE id IN (
  '3afa2281-1edb-4f5b-bb4c-1daf404a1f94'::uuid,
  '6b058020-8d83-418f-9a50-8909fd6f24cf'::uuid,
  '3156bc38-8de4-4076-8df1-88cdc041a485'::uuid
);

UPDATE public.nodes
SET prompt_config = jsonb_set(
  prompt_config,
  '{prompt}',
  to_jsonb('Animate the provided start frame as a realistic vertical UGC mirror outfit video. Preserve the clothing already shown in the start frame exactly, including uploaded top and bottom garment colors, graphics, logos, fit, seams, and fabric texture. Use natural handheld phone movement, subtle micro-shake, and a gentle outfit-check drift. Do not change the outfit. Do not introduce pink hoodie, leggings, headband, leather jacket, unrelated logos, or any garment that was not uploaded. Keep identity, room, lighting, and garment details consistent from first frame to last frame.'::text)
)
WHERE id IN (
  'b498bc49-3b52-4403-aac2-a8fde331de5c'::uuid,
  '71ea2725-041e-495a-9e64-62db2aa58e8a'::uuid,
  'e9242abb-1f48-4e10-87cb-c86ee7f7d891'::uuid
);

UPDATE public.nodes
SET prompt_config = jsonb_set(prompt_config, '{output_exposed}', 'false'::jsonb)
WHERE id = '0f91a353-74cd-42b1-98ec-151c5b718b70'::uuid
  AND version_id = 'cee82b94-abf1-49a1-a336-88c9025528bb'::uuid;

INSERT INTO public.edges (id, version_id, source_node_id, target_node_id, mapping_logic, condition_logic)
SELECT
  gen_random_uuid(),
  'cee82b94-abf1-49a1-a336-88c9025528bb'::uuid,
  'f710248f-1e72-4713-b7eb-33b9b9dc454d'::uuid,
  target_node_id,
  jsonb_build_object('edge_order', 3, 'target_param', 'bottom_garment_image'),
  '{}'::jsonb
FROM (
  VALUES
    ('3afa2281-1edb-4f5b-bb4c-1daf404a1f94'::uuid),
    ('6b058020-8d83-418f-9a50-8909fd6f24cf'::uuid),
    ('3156bc38-8de4-4076-8df1-88cdc041a485'::uuid)
) AS targets(target_node_id)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.edges e
  WHERE e.version_id = 'cee82b94-abf1-49a1-a336-88c9025528bb'::uuid
    AND e.source_node_id = 'f710248f-1e72-4713-b7eb-33b9b9dc454d'::uuid
    AND e.target_node_id = targets.target_node_id
);
