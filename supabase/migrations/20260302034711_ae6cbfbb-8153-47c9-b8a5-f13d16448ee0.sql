
-- Add Weavy-specific columns to templates table
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS weavy_flow_url text,
  ADD COLUMN IF NOT EXISTS weavy_recipe_id text,
  ADD COLUMN IF NOT EXISTS weavy_recipe_version integer,
  ADD COLUMN IF NOT EXISTS input_schema jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS output_type text DEFAULT 'video',
  ADD COLUMN IF NOT EXISTS expected_output_count integer DEFAULT 1;

-- Add weavy_run_id to projects table to track Weavy runs
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS weavy_run_id text;
