-- Campaign Director: one jsonb document per campaign, owner-scoped (same pattern as madden_media_projects).
-- Applied to production (ykrrwgkxgidoavtzcumk) via Supabase MCP on 2026-10-29 because Lovable refuses supabase/migrations/.
CREATE TABLE IF NOT EXISTS public.campaign_director_projects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled campaign',
  project_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_director_projects TO authenticated;
GRANT ALL ON public.campaign_director_projects TO service_role;

ALTER TABLE public.campaign_director_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own campaign director projects" ON public.campaign_director_projects;
CREATE POLICY "Users manage their own campaign director projects"
  ON public.campaign_director_projects FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS campaign_director_projects_user_updated_idx
  ON public.campaign_director_projects (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS update_campaign_director_projects_updated_at ON public.campaign_director_projects;
CREATE TRIGGER update_campaign_director_projects_updated_at
  BEFORE UPDATE ON public.campaign_director_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
