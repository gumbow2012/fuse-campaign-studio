CREATE TABLE public.studio_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  kind TEXT NOT NULL DEFAULT 'image',
  provider TEXT,
  provider_model TEXT,
  provider_request_id TEXT,
  prompt TEXT,
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_url TEXT,
  output_type TEXT,
  error_log TEXT,
  estimated_credits INTEGER,
  estimated_cost_usd NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_generations TO authenticated;
GRANT ALL ON public.studio_generations TO service_role;

ALTER TABLE public.studio_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own studio generations"
ON public.studio_generations FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX studio_generations_user_created_idx
ON public.studio_generations (user_id, created_at DESC);

CREATE TRIGGER update_studio_generations_updated_at
BEFORE UPDATE ON public.studio_generations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();