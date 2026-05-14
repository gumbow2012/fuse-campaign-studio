UPDATE public.nodes
SET prompt_config = COALESCE(prompt_config, '{}'::jsonb)
  || jsonb_build_object(
    'aspect_ratio', '9:16',
    'duration',
      CASE
        WHEN COALESCE(prompt_config->>'duration', '') ~ '^[0-9]+$'
          THEN (prompt_config->>'duration')::integer
        ELSE 10
      END
  )
WHERE node_type = 'video_gen';
