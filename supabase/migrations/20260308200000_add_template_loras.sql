-- Add loras column to templates for storing LoRA fine-tune configurations
-- extracted from Weavy workflow nodes.
-- Each entry: { "path": "https://...", "scale": 1.0, "trigger_word": "...", "step_id": "image_edit" }

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS loras JSONB DEFAULT '[]';

COMMENT ON COLUMN public.templates.loras IS
  'LoRA fine-tune configurations extracted from Weavy workflow nodes. '
  'Array of { path, scale, trigger_word?, step_id? }.';
