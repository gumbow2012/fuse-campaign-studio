ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS raw_json jsonb NULL,
  ADD COLUMN IF NOT EXISTS nodes_count integer NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS edges_count integer NULL DEFAULT 0;