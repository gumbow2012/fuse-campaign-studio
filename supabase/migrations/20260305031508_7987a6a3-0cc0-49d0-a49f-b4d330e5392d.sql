ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0;