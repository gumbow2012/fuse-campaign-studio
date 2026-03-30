with ranked as (
  select n.id,
         row_number() over (
           partition by n.version_id
           order by
             case when n.node_type = 'image_gen' then 0 else 1 end,
             coalesce((n.prompt_config->>'output_order')::int, 999999),
             coalesce((n.prompt_config->>'sort_order')::int, 999999),
             n.created_at,
             n.id
         ) as new_output_order
  from nodes n
  join template_versions tv on tv.id = n.version_id
  where tv.is_active = true
    and coalesce((n.prompt_config->>'output_exposed')::boolean, false) = true
)
update nodes n
set prompt_config = jsonb_set(coalesce(n.prompt_config, '{}'::jsonb), '{output_order}', to_jsonb(r.new_output_order))
from ranked r
where n.id = r.id;
