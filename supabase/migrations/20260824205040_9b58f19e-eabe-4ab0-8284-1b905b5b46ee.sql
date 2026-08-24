CREATE TABLE public.cinema_preview_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  preset_id text NOT NULL,
  category text NOT NULL,
  kind text NOT NULL DEFAULT 'still',
  src text,
  poster text,
  thumb_src text,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  swatches text[] NOT NULL DEFAULT '{}',
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cinema_preview_assets_global_preset_idx
  ON public.cinema_preview_assets (preset_id) WHERE user_id IS NULL;
CREATE UNIQUE INDEX cinema_preview_assets_user_preset_idx
  ON public.cinema_preview_assets (user_id, preset_id) WHERE user_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cinema_preview_assets TO authenticated;
GRANT ALL ON public.cinema_preview_assets TO service_role;

ALTER TABLE public.cinema_preview_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view cinema preview assets"
  ON public.cinema_preview_assets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage shared cinema preview assets"
  ON public.cinema_preview_assets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users manage their own cinema preview assets"
  ON public.cinema_preview_assets FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_cinema_preview_assets_updated_at
  BEFORE UPDATE ON public.cinema_preview_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();