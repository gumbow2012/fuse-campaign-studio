CREATE TABLE public.cinema_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled cinema project',
  project_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cinema_projects TO authenticated;
GRANT ALL ON public.cinema_projects TO service_role;

ALTER TABLE public.cinema_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cinema_projects_select_own" ON public.cinema_projects FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "cinema_projects_insert_own" ON public.cinema_projects FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "cinema_projects_update_own" ON public.cinema_projects FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "cinema_projects_delete_own" ON public.cinema_projects FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX cinema_projects_user_updated_idx ON public.cinema_projects (user_id, updated_at DESC);

CREATE TRIGGER cinema_projects_set_updated_at
BEFORE UPDATE ON public.cinema_projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.cinema_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',
  builtin BOOLEAN NOT NULL DEFAULT false,
  thumbnail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cinema_presets TO authenticated;
GRANT ALL ON public.cinema_presets TO service_role;

ALTER TABLE public.cinema_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cinema_presets_select_builtin_or_own" ON public.cinema_presets FOR SELECT TO authenticated USING (builtin = true OR user_id = auth.uid());
CREATE POLICY "cinema_presets_insert_own" ON public.cinema_presets FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND builtin = false);
CREATE POLICY "cinema_presets_update_own" ON public.cinema_presets FOR UPDATE TO authenticated USING (user_id = auth.uid() AND builtin = false) WITH CHECK (user_id = auth.uid() AND builtin = false);
CREATE POLICY "cinema_presets_delete_own" ON public.cinema_presets FOR DELETE TO authenticated USING (user_id = auth.uid() AND builtin = false);

CREATE INDEX cinema_presets_user_idx ON public.cinema_presets (user_id);
CREATE INDEX cinema_presets_type_idx ON public.cinema_presets (type);