CREATE TABLE IF NOT EXISTS public.template_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, template_id)
);

GRANT SELECT, INSERT, DELETE ON public.template_favorites TO authenticated;
GRANT ALL ON public.template_favorites TO service_role;

ALTER TABLE public.template_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own template favorites" ON public.template_favorites;
CREATE POLICY "Users manage their own template favorites"
ON public.template_favorites FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());