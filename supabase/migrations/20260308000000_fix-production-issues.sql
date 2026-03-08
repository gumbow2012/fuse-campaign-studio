-- Fix production issues for V6 pipeline
-- 1. Allow template_id to be NULL (V6 uses template_name from R2 instead)
ALTER TABLE public.projects ALTER COLUMN template_id DROP NOT NULL;

-- 2. Allow user_id to be NULL (service API key calls don't have a Supabase auth user)
ALTER TABLE public.projects ALTER COLUMN user_id DROP NOT NULL;

-- 3. Add error column (safe if already exists)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS error TEXT;

-- 4. Add started_at column (safe if already exists)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- 5. Index on template_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_projects_template_name ON public.projects(template_name);
