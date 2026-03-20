DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'app_role'
      AND t.typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
END
$$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dev';

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'users_read_own_roles'
  ) THEN
    CREATE POLICY "users_read_own_roles"
      ON public.user_roles FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'admins_manage_roles'
  ) THEN
    CREATE POLICY "admins_manage_roles"
      ON public.user_roles FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.user_roles r
        WHERE r.user_id = auth.uid() AND r.role = 'admin'
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.user_roles r
        WHERE r.user_id = auth.uid() AND r.role = 'admin'
      ));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  name                TEXT,
  plan                TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'inactive',
  credits_balance     INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'users_read_own_profile'
  ) THEN
    CREATE POLICY "users_read_own_profile"
      ON public.profiles FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'users_update_own_profile'
  ) THEN
    CREATE POLICY "users_update_own_profile"
      ON public.profiles FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'users_insert_own_profile'
  ) THEN
    CREATE POLICY "users_insert_own_profile"
      ON public.profiles FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'admins_read_all_profiles'
  ) THEN
    CREATE POLICY "admins_read_all_profiles"
      ON public.profiles FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.user_roles r
        WHERE r.user_id = auth.uid() AND r.role = 'admin'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'admins_update_all_profiles'
  ) THEN
    CREATE POLICY "admins_update_all_profiles"
      ON public.profiles FOR UPDATE
      USING (EXISTS (
        SELECT 1 FROM public.user_roles r
        WHERE r.user_id = auth.uid() AND r.role = 'admin'
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.user_roles r
        WHERE r.user_id = auth.uid() AND r.role = 'admin'
      ));
  END IF;
END
$$;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, name)
  VALUES (
    NEW.id,
    lower(COALESCE(NEW.email, '')),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email,
      name = COALESCE(public.profiles.name, EXCLUDED.name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (user_id, email, name)
SELECT
  u.id,
  lower(COALESCE(u.email, '')),
  COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
FROM auth.users u
ON CONFLICT (user_id) DO UPDATE
SET email = EXCLUDED.email,
    name = COALESCE(public.profiles.name, EXCLUDED.name);

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'::public.app_role
FROM auth.users u
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.nodes
SET prompt_config = jsonb_set(
  COALESCE(prompt_config, '{}'::jsonb),
  '{prompt}',
  to_jsonb('Replace the delivery person''s hoodie or t-shirt with the uploaded garment. Keep the Ring doorbell fisheye angle, porch lighting, package, body pose, and security-camera realism. Preserve the subject''s body, face, hands, and the rest of the scene. Use the uploaded garment as a clothing reference only, matching its colors, graphics, and fit naturally.'::text)
)
WHERE id = '71d752b1-2844-44b4-9f79-a5b7ed949a51';

UPDATE public.nodes
SET name = 'Input: Hat'
WHERE id = 'e6510486-7443-4ac7-bc68-35b7ebe633f8';

UPDATE public.nodes
SET prompt_config = jsonb_set(
  COALESCE(prompt_config, '{}'::jsonb),
  '{prompt}',
  to_jsonb('Replace only the delivery person''s hat with the uploaded hat reference. Keep the hoodie, package, porch lighting, body pose, Ring camera fisheye framing, and security-camera realism unchanged.'::text)
)
WHERE id = 'e20dc8b9-44eb-4dae-9bbd-8d510a1c79b8';
