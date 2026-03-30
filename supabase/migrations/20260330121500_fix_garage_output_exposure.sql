with garage as (
  select tv.id as version_id
  from public.template_versions tv
  join public.fuse_templates ft on ft.id = tv.template_id
  where ft.name = 'GARAGE'
    and tv.is_active = true
  limit 1
)
update public.nodes n
set prompt_config = jsonb_set(
  coalesce(n.prompt_config, '{}'::jsonb),
  '{output_exposed}',
  to_jsonb(
    n.id in (
      'a128c056-be48-4bde-af08-596678acdd4a',
      'c9a489b9-ed57-47d3-b333-3173fce7d08c',
      '964a9d48-42b7-4d4f-92da-677cb96ea75b',
      '0d4e0ba3-1803-44c8-b71c-9782abb2bb19',
      'c97b8dc8-391a-47c5-9f18-4e4d99ec149c',
      '2bff05ec-5408-49cc-a8fb-9829a76ff3a4'
    )
  ),
  true
)
from garage g
where n.version_id = g.version_id
  and n.node_type = 'video_gen';
