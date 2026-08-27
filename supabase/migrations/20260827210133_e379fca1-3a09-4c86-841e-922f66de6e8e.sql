CREATE TABLE IF NOT EXISTS public.madden_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('subject','outfit','jewelry','environment')),
  name TEXT NOT NULL DEFAULT 'Untitled',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  thumbnail_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.madden_profiles TO authenticated;
GRANT ALL ON public.madden_profiles TO service_role;

ALTER TABLE public.madden_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own madden profiles" ON public.madden_profiles;
CREATE POLICY "Users manage their own madden profiles"
ON public.madden_profiles FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS madden_profiles_user_kind_idx ON public.madden_profiles (user_id, kind, updated_at DESC);

DROP TRIGGER IF EXISTS update_madden_profiles_updated_at ON public.madden_profiles;
CREATE TRIGGER update_madden_profiles_updated_at
BEFORE UPDATE ON public.madden_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();