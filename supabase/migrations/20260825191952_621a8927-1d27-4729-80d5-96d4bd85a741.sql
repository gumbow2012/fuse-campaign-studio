CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE public.creator_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  handle citext NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  avatar_url text,
  banner_url text,
  bio text,
  description text,
  location text,
  website text,
  instagram text,
  tiktok text,
  x_handle text,
  portfolio_url text,
  specialties text[] NOT NULL DEFAULT '{}',
  accent text NOT NULL DEFAULT 'fuse-cyan',
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.creator_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_profiles TO authenticated;
GRANT ALL ON public.creator_profiles TO service_role;

ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public creator profiles are viewable by everyone"
ON public.creator_profiles FOR SELECT
USING (is_public = true OR auth.uid() = user_id);

CREATE POLICY "Creators can insert their own profile"
ON public.creator_profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Creators can update their own profile"
ON public.creator_profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Creators can delete their own profile"
ON public.creator_profiles FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_creator_profiles_updated_at
BEFORE UPDATE ON public.creator_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();