CREATE TABLE IF NOT EXISTS public.madden_media_projects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled project',
  project_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.madden_media_projects TO authenticated;
GRANT ALL ON public.madden_media_projects TO service_role;

ALTER TABLE public.madden_media_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own madden media projects" ON public.madden_media_projects;
CREATE POLICY "Users manage their own madden media projects"
  ON public.madden_media_projects FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS madden_media_projects_user_updated_idx
  ON public.madden_media_projects (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS update_madden_media_projects_updated_at ON public.madden_media_projects;
CREATE TRIGGER update_madden_media_projects_updated_at
  BEFORE UPDATE ON public.madden_media_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();