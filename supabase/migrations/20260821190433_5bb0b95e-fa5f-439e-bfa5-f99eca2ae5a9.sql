CREATE TABLE IF NOT EXISTS public.jewelry_knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_key text NOT NULL UNIQUE,
  canonical_name text NOT NULL,
  vocabulary_domain text,
  aliases text[] NOT NULL DEFAULT '{}',
  definition text,
  engineering_signature jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_urls text[] NOT NULL DEFAULT '{}',
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.jewelry_knowledge_base TO authenticated;
GRANT ALL ON public.jewelry_knowledge_base TO service_role;

ALTER TABLE public.jewelry_knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read jewelry knowledge base" ON public.jewelry_knowledge_base;
CREATE POLICY "Authenticated can read jewelry knowledge base"
  ON public.jewelry_knowledge_base
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role manages jewelry knowledge base" ON public.jewelry_knowledge_base;
CREATE POLICY "Service role manages jewelry knowledge base"
  ON public.jewelry_knowledge_base
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS jewelry_knowledge_base_term_key_idx
  ON public.jewelry_knowledge_base (term_key);