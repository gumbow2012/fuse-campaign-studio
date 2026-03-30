update nodes
set prompt_config = jsonb_set(
  prompt_config,
  '{prompt}',
  to_jsonb('A realistic cinematic scene shot in natural daylight outside a suburban front doorway. A man wearing a blue reflective safety vest over a black shirt walks up to the doorstep like a delivery driver, moving casually and believably. He pauses at the door, subtly looks left and right with a suspicious expression, then notices a small black package sitting on the doorstep. He bends down, picks it up, and opens the package directly in front of the camera with natural hand motion and realistic plastic tearing. Inside, he pulls out the exact uploaded garment from the user input, clearly showing the real product shape, color, and material instead of inventing a different clothing item. He holds the garment up to camera so the product is plainly visible. Camera is handheld but steady at chest height with realistic micro-shake, shallow depth of field, natural shadows, documentary-style realism, true-to-life motion, no CGI, no stylization, 4K clarity, and believable human movement.'::text)
)
where id = 'ca2ccffc-0b24-46aa-8bef-5a3e4952a263';

update nodes
set prompt_config = jsonb_set(
  prompt_config,
  '{prompt}',
  to_jsonb('A realistic handheld cinematic shot inside a dim indoor hallway with moody overhead lighting. A man wearing a blue reflective safety vest over a black shirt stands centered in frame holding a black plastic package. He quickly rips the package open with urgency, then pulls out the exact uploaded garment from the user input in one smooth motion. He snaps the garment upward and points it directly toward the camera, arms extended, clearly presenting the actual product front without changing it into a hoodie or any other substitute item. The motion is fast but controlled, fabric reacting naturally with slight folds and weight as it lifts. Camera remains chest-height and slightly wide with subtle handheld shake, natural lens distortion at the edges, realistic shadows, true-to-life skin texture, authentic clothing physics, no CGI, no stylization, documentary realism, sharp focus on the garment as it reaches the camera, 4K clarity, believable human movement and timing.'::text)
)
where id = '13c9da7a-1f00-4d96-b736-2c6406b8321c';

update edges
set source_node_id = '89b79cf1-1354-49b0-a1f8-b9d67105e949'
where target_node_id in ('ca2ccffc-0b24-46aa-8bef-5a3e4952a263','13c9da7a-1f00-4d96-b736-2c6406b8321c')
  and mapping_logic->>'target_param' = 'init_image';

update nodes set prompt_config = jsonb_set(prompt_config, '{output_order}', '1'::jsonb) where id = 'afe25d72-32da-4d74-a826-d3c1eb1a478a';
update nodes set prompt_config = jsonb_set(prompt_config, '{output_order}', '2'::jsonb) where id = 'ab6bfcfe-210a-4eee-bd80-11562de953ce';
update nodes set prompt_config = jsonb_set(prompt_config, '{output_order}', '3'::jsonb) where id = 'ca2ccffc-0b24-46aa-8bef-5a3e4952a263';
update nodes set prompt_config = jsonb_set(prompt_config, '{output_order}', '4'::jsonb) where id = '13c9da7a-1f00-4d96-b736-2c6406b8321c';
update nodes set prompt_config = jsonb_set(prompt_config, '{output_order}', '5'::jsonb) where id = 'c29a5e4b-162b-430f-9e20-3ebe399bee16';
update nodes set prompt_config = jsonb_set(prompt_config, '{output_order}', '6'::jsonb) where id = 'cf730b82-4211-4639-b7ba-b9d11d0bf2d5';
