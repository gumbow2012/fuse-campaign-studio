CREATE TABLE public.outfit_swap_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'outfit-swap-source-analysis-v1',
  analysis JSONB NOT NULL,
  analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX outfit_swap_analyses_user_fingerprint_idx
  ON public.outfit_swap_analyses (user_id, fingerprint);

GRANT SELECT ON public.outfit_swap_analyses TO authenticated;
GRANT ALL ON public.outfit_swap_analyses TO service_role;

ALTER TABLE public.outfit_swap_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own outfit swap analyses"
  ON public.outfit_swap_analyses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);