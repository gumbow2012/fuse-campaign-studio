with ranked_edges as (
  select
    e.id,
    row_number() over (
      partition by e.target_node_id
      order by
        case
          when coalesce(e.mapping_logic->>'edge_order', e.mapping_logic->>'sort_order') ~ '^[0-9]+$'
            then coalesce(e.mapping_logic->>'edge_order', e.mapping_logic->>'sort_order')::integer
          else 9999
        end,
        case
          when coalesce(e.mapping_logic->>'target_param', '') like 'image_%'
            and substring(coalesce(e.mapping_logic->>'target_param', '') from '^image_([0-9]+)$') is not null
            then substring(coalesce(e.mapping_logic->>'target_param', '') from '^image_([0-9]+)$')::integer
          when coalesce(e.mapping_logic->>'target_param', '') = 'reference_image' then 10
          when coalesce(e.mapping_logic->>'target_param', '') = 'model_reference_image' then 11
          when coalesce(e.mapping_logic->>'target_param', '') = 'product_image' then 12
          when coalesce(e.mapping_logic->>'target_param', '') like '%_image' then 15
          when coalesce(e.mapping_logic->>'target_param', '') = 'start_frame_image' then 30
          when coalesce(e.mapping_logic->>'target_param', '') = 'end_frame_image' then 31
          when coalesce(e.mapping_logic->>'target_param', '') = 'init_image' then 40
          else 100
        end,
        source_node.name,
        e.id
    ) as edge_order,
    e.mapping_logic,
    source_node.node_type as source_node_type,
    source_node.default_asset_id as source_default_asset_id,
    source_node.prompt_config as source_prompt_config,
    target_node.node_type as target_node_type
  from public.edges e
  join public.nodes source_node on source_node.id = e.source_node_id
  join public.nodes target_node on target_node.id = e.target_node_id
),
inferred_edges as (
  select
    id,
    edge_order,
    case
      when nullif(trim(coalesce(mapping_logic->>'target_param', '')), '') is not null
        then trim(mapping_logic->>'target_param')
      when target_node_type = 'video_gen'
        then 'start_frame_image'
      when target_node_type = 'image_gen'
        and source_node_type = 'user_input'
        and (
          source_prompt_config->>'editor_mode' = 'reference'
          or source_default_asset_id is not null
        )
        then 'reference_image'
      when target_node_type = 'image_gen'
        and source_node_type = 'user_input'
        and nullif(trim(coalesce(source_prompt_config->>'editor_slot_key', '')), '') is not null
        then case
          when regexp_replace(lower(trim(source_prompt_config->>'editor_slot_key')), '[^a-z0-9_]+', '_', 'g') like '%_image'
            then regexp_replace(lower(trim(source_prompt_config->>'editor_slot_key')), '[^a-z0-9_]+', '_', 'g')
          else regexp_replace(lower(trim(source_prompt_config->>'editor_slot_key')), '[^a-z0-9_]+', '_', 'g') || '_image'
        end
      when target_node_type = 'image_gen'
        then 'image_' || edge_order::text
      else 'image'
    end as target_param
  from ranked_edges
)
update public.edges e
set mapping_logic = coalesce(e.mapping_logic, '{}'::jsonb) ||
  jsonb_build_object(
    'target_param', inferred_edges.target_param,
    'edge_order', inferred_edges.edge_order
  )
from inferred_edges
where e.id = inferred_edges.id;
