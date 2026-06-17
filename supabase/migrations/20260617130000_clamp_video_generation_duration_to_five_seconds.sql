UPDATE public.nodes
SET prompt_config = jsonb_set(
  COALESCE(prompt_config, '{}'::jsonb),
  '{duration}',
  '5'::jsonb,
  true
)
WHERE node_type = 'video_gen'
  AND COALESCE(prompt_config->>'duration', '') ~ '^[0-9]+$'
  AND (prompt_config->>'duration')::integer > 5;
