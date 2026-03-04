
-- Set default input_schema (one clothing item upload) for all templates that have empty or null input_schema
UPDATE templates
SET input_schema = '[{"key": "clothing_item", "label": "Clothing Item", "nodeId": "clothing_item", "type": "image", "required": true}]'::jsonb
WHERE id != '1e2ff926-fb8d-45b3-8566-adec76a42cd3'
  AND (input_schema IS NULL OR input_schema = '[]'::jsonb);
