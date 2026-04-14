do $$
declare
  version_uuid uuid;
  front_node_uuid uuid;
  back_node_uuid uuid;
  logo_node_uuid uuid;
  hero_node_uuid uuid;
  turnaround_node_uuid uuid;
  side_profile_node_uuid uuid;
  front_prompt_config jsonb;
begin
  select v.id
  into version_uuid
  from fuse_templates t
  join template_versions v on v.template_id = t.id
  where t.name = 'ARMORED TRUCK'
    and v.is_active = true
  order by v.version_number desc
  limit 1;

  if version_uuid is null then
    raise exception 'Active ARMORED TRUCK version not found';
  end if;

  select id, coalesce(prompt_config, '{}'::jsonb)
  into front_node_uuid, front_prompt_config
  from nodes
  where version_id = version_uuid
    and node_type = 'user_input'
    and coalesce(prompt_config->>'editor_slot_key', '') in ('garment', 'front-garment')
  order by coalesce((prompt_config->>'sort_order')::int, 999), created_at
  limit 1;

  if front_node_uuid is null then
    raise exception 'Front garment node not found for ARMORED TRUCK';
  end if;

  select id
  into logo_node_uuid
  from nodes
  where version_id = version_uuid
    and node_type = 'user_input'
    and coalesce(prompt_config->>'editor_slot_key', '') = 'logo'
  order by coalesce((prompt_config->>'sort_order')::int, 999), created_at
  limit 1;

  update nodes
  set prompt_config = coalesce(prompt_config, '{}'::jsonb) || jsonb_build_object(
    'editor_mode', 'upload',
    'editor_label', 'Front of Garment',
    'editor_slot_key', 'front-garment',
    'editor_expected', 'image',
    'expected', 'image',
    'sort_order', 23,
    'weavy_exposed', true
  )
  where id = front_node_uuid;

  if logo_node_uuid is not null then
    update nodes
    set prompt_config = coalesce(prompt_config, '{}'::jsonb) || jsonb_build_object(
      'sort_order', 25
    )
    where id = logo_node_uuid;
  end if;

  select id
  into back_node_uuid
  from nodes
  where version_id = version_uuid
    and node_type = 'user_input'
    and coalesce(prompt_config->>'editor_slot_key', '') = 'back-garment'
  order by coalesce((prompt_config->>'sort_order')::int, 999), created_at
  limit 1;

  if back_node_uuid is null then
    insert into nodes (version_id, node_type, prompt_config, default_asset_id, name)
    values (
      version_uuid,
      'user_input',
      (front_prompt_config - 'weavy_node_id') || jsonb_build_object(
        'editor_mode', 'upload',
        'editor_label', 'Back of Garment',
        'editor_slot_key', 'back-garment',
        'editor_expected', 'image',
        'expected', 'image',
        'sort_order', 24,
        'weavy_exposed', true
      ),
      null,
      'Input 2'
    )
    returning id into back_node_uuid;
  else
    update nodes
    set prompt_config = coalesce(prompt_config, '{}'::jsonb) || jsonb_build_object(
      'editor_mode', 'upload',
      'editor_label', 'Back of Garment',
      'editor_slot_key', 'back-garment',
      'editor_expected', 'image',
      'expected', 'image',
      'sort_order', 24,
      'weavy_exposed', true
    )
    where id = back_node_uuid;
  end if;

  select id
  into hero_node_uuid
  from nodes
  where version_id = version_uuid
    and node_type = 'image_gen'
    and coalesce(prompt_config->>'prompt', '') like 'Luxury streetwear automotive campaign.%'
  limit 1;

  select id
  into turnaround_node_uuid
  from nodes
  where version_id = version_uuid
    and node_type = 'image_gen'
    and coalesce(prompt_config->>'prompt', '') like 'Subject facing slightly away from camera%'
  limit 1;

  select id
  into side_profile_node_uuid
  from nodes
  where version_id = version_uuid
    and node_type = 'image_gen'
    and coalesce(prompt_config->>'prompt', '') like 'Full side profile shot%'
  limit 1;

  if hero_node_uuid is not null then
    update nodes
    set prompt_config = jsonb_set(
      coalesce(prompt_config, '{}'::jsonb),
      '{prompt}',
      to_jsonb('Luxury streetwear automotive campaign.

Use the uploaded base image for composition, lighting, and model posture.
Keep the same industrial garage environment and overhead panel lighting.

MODEL

Use the uploaded front garment and back garment references together.
Preserve the exact front print, rear print, silhouette, seams, stitching, logo placement, and garment proportions across the turnaround.
Keep the same model, pose, stance, and facial expression.
Maintain the lighting direction and camera framing.
Replace his outfit with the uploaded oversized shirt and oversized baggy pants that fold over on top of shoes while keeping the garment details true to both uploaded references.

Preserve:
• Fabric texture
• Stitching
• Graphic scale
• Pant logo placement
• Front and back garment accuracy
• Garment proportions

No distortion.
No redesign.
Ultra realistic textile response.

VEHICLE REPLACEMENT

Replace the Cybertruck with a heavily modified custom armored Mercedes G-Class (G-Wagon).

Vehicle styling:

• Wide-body armored fender flares
• Reinforced bolt-on steel armor panels
• Visible rivets and mounting hardware
• Matte obsidian or dark gunmetal finish
• Aggressive off-road stance
• Thick all-terrain tires
• Reinforced front bumper with skid protection
• Roof rack with industrial crossbars
• Rear spare tire carrier

The vehicle must feel tactical, engineered, custom-built — not factory stock.

LOGO INTEGRATION (CRITICAL RULES)

Use the uploaded logo.

DO NOT:

Tile logo

Create repeating wallpaper patterns

Scatter small icons

Wrap entire vehicle in graphics

Add floating overlays

Add extra symbols

Instead:

Integrate the logo as physical forged metal emblems built into the armored panels.

Each logo must:

• Be raised or deeply engraved
• Have beveled edges
• Show real metal depth
• Cast natural shadows
• Show brushed steel or forged titanium texture
• Include subtle edge wear and micro scratches
• Look structurally integrated, not applied after paint

LOGO PLACEMENT

• One large forged emblem centered on hood armor plate
• One large emblem mounted on each front door panel
• One engraved into rear spare tire housing
• One machined into front skid plate

Each visible logo should dominate its panel (25–40% coverage).

One logo per surface.
No duplication grid.
No repeated pattern wrapping across panels.

The logo must feel manufactured into the vehicle structure.

MATERIAL DETAILING

Body armor:
Matte metal finish.
Subtle surface texture.
Light industrial wear.
Visible bolt heads and seams.

Logos:
Forged steel.
Brushed grain.
Depth in engraving.
Subtle oxidation in recesses.

Tires:
Light dust on sidewalls.
Realistic tread depth.

LIGHTING

Soft overhead industrial panel lighting.
High contrast.
Sleek, aggressive editorial tone.
Controlled reflections on metal surfaces.
Depth of field: model remains primary subject, vehicle slightly softened but logos clearly readable.

CAMERA

Low 3/4 hero angle.
Full body visible.
85mm lens compression.
Ultra photoreal.
Automotive campaign grade realism.

NEGATIVE CONSTRAINTS

No logo tiling.
No pattern repetition.
No floating graphics.
No stretched distortion.
No CGI plastic look.
No added typography.

Ultra realistic.
Cinematic.
Engineered.'::text),
      true
    )
    where id = hero_node_uuid;

    insert into edges (version_id, source_node_id, target_node_id, mapping_logic)
    select version_uuid, back_node_uuid, hero_node_uuid, jsonb_build_object('target_param', 'image_4')
    where not exists (
      select 1
      from edges
      where version_id = version_uuid
        and source_node_id = back_node_uuid
        and target_node_id = hero_node_uuid
        and coalesce(mapping_logic->>'target_param', '') = 'image_4'
    );
  end if;

  if turnaround_node_uuid is not null then
    update nodes
    set prompt_config = jsonb_set(
      coalesce(prompt_config, '{}'::jsonb),
      '{prompt}',
      to_jsonb('Subject facing slightly away from camera, over-the-shoulder glance, natural posture, no dramatic pose, subtle head tilt, light hitting the edge of the top, bottoms slightly creased from natural movement, shallow depth of field, grounded streetwear editorial vibe. Use the back garment upload as the primary rear-view garment reference so the back print, paneling, and seams stay accurate.'::text),
      true
    )
    where id = turnaround_node_uuid;

    insert into edges (version_id, source_node_id, target_node_id, mapping_logic)
    select version_uuid, back_node_uuid, turnaround_node_uuid, jsonb_build_object('target_param', 'image_2')
    where not exists (
      select 1
      from edges
      where version_id = version_uuid
        and source_node_id = back_node_uuid
        and target_node_id = turnaround_node_uuid
        and coalesce(mapping_logic->>'target_param', '') = 'image_2'
    );
  end if;

  if side_profile_node_uuid is not null then
    update nodes
    set prompt_config = jsonb_set(
      coalesce(prompt_config, '{}'::jsonb),
      '{prompt}',
      to_jsonb('Full side profile shot, subject facing 45 degrees left, neutral expression, hands resting naturally, soft industrial lighting casting a long subtle shadow, realistic body proportions, calm and understated. Use both the front garment and back garment uploads to preserve side seam placement and rear-body garment accuracy.'::text),
      true
    )
    where id = side_profile_node_uuid;

    insert into edges (version_id, source_node_id, target_node_id, mapping_logic)
    select version_uuid, back_node_uuid, side_profile_node_uuid, jsonb_build_object('target_param', 'image_3')
    where not exists (
      select 1
      from edges
      where version_id = version_uuid
        and source_node_id = back_node_uuid
        and target_node_id = side_profile_node_uuid
        and coalesce(mapping_logic->>'target_param', '') = 'image_3'
    );
  end if;
end $$;
