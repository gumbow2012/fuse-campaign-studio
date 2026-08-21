CREATE TABLE IF NOT EXISTS public.jewelry_swap_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text,
  source_video_url text,
  project_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jewelry_swap_projects TO authenticated;
GRANT ALL ON public.jewelry_swap_projects TO service_role;

ALTER TABLE public.jewelry_swap_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own jewelry swap projects" ON public.jewelry_swap_projects;
CREATE POLICY "Users can view their own jewelry swap projects"
  ON public.jewelry_swap_projects
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own jewelry swap projects" ON public.jewelry_swap_projects;
CREATE POLICY "Users can insert their own jewelry swap projects"
  ON public.jewelry_swap_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own jewelry swap projects" ON public.jewelry_swap_projects;
CREATE POLICY "Users can update their own jewelry swap projects"
  ON public.jewelry_swap_projects
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own jewelry swap projects" ON public.jewelry_swap_projects;
CREATE POLICY "Users can delete their own jewelry swap projects"
  ON public.jewelry_swap_projects
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS jewelry_swap_projects_user_updated_idx
  ON public.jewelry_swap_projects (user_id, updated_at DESC);