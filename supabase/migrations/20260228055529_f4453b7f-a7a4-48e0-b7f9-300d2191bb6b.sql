
-- Roles enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  stripe_customer_id TEXT,
  plan TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'inactive',
  credits_balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Templates table
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  preview_url TEXT,
  required_inputs JSONB DEFAULT '{}',
  estimated_credits_per_run INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  category TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active templates" ON public.templates
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage templates" ON public.templates
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Projects table
CREATE TYPE public.project_status AS ENUM ('queued', 'running', 'failed', 'complete');

CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES public.templates(id) NOT NULL,
  status public.project_status NOT NULL DEFAULT 'queued',
  inputs JSONB DEFAULT '{}',
  outputs JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own projects" ON public.projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects" ON public.projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON public.projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all projects" ON public.projects
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all projects" ON public.projects
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Project Steps
CREATE TYPE public.step_status AS ENUM ('queued', 'running', 'failed', 'complete');

CREATE TABLE public.project_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  step_key TEXT NOT NULL,
  status public.step_status NOT NULL DEFAULT 'queued',
  output_url TEXT,
  last_run_cost_credits INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.project_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own steps" ON public.project_steps
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_steps.project_id AND projects.user_id = auth.uid())
  );

CREATE POLICY "Admins can read all steps" ON public.project_steps
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Credit Ledger
CREATE TYPE public.credit_event_type AS ENUM (
  'run_template', 'rerun_step', 'topup', 'monthly_grant', 'refund', 'adjustment'
);

CREATE TABLE public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type public.credit_event_type NOT NULL,
  amount INTEGER NOT NULL, -- negative for spend, positive for grants
  template_id UUID REFERENCES public.templates(id),
  project_id UUID REFERENCES public.projects(id),
  step_id UUID REFERENCES public.project_steps(id),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ledger" ON public.credit_ledger
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all ledger" ON public.credit_ledger
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert ledger" ON public.credit_ledger
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_project_steps_updated_at BEFORE UPDATE ON public.project_steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for project outputs
INSERT INTO storage.buckets (id, name, public) VALUES ('project-assets', 'project-assets', false);

CREATE POLICY "Users can read own assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Service can upload assets" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'project-assets');
