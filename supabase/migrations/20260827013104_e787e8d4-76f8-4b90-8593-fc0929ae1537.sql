CREATE TABLE public.template_collections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  slug TEXT NOT NULL UNIQUE,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.template_collections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_collections TO authenticated;
GRANT ALL ON public.template_collections TO service_role;

ALTER TABLE public.template_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public collections are readable by anyone"
  ON public.template_collections FOR SELECT
  USING (is_public = true);

CREATE POLICY "Owners can read their own collections"
  ON public.template_collections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owners can create their own collections"
  ON public.template_collections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update their own collections"
  ON public.template_collections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can delete their own collections"
  ON public.template_collections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.template_collection_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id UUID NOT NULL REFERENCES public.template_collections(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (collection_id, template_id)
);

GRANT SELECT ON public.template_collection_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_collection_items TO authenticated;
GRANT ALL ON public.template_collection_items TO service_role;

ALTER TABLE public.template_collection_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Items of public collections are readable by anyone"
  ON public.template_collection_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.template_collections c
    WHERE c.id = collection_id AND c.is_public = true
  ));

CREATE POLICY "Owners can read their collection items"
  ON public.template_collection_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.template_collections c
    WHERE c.id = collection_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Owners can insert their collection items"
  ON public.template_collection_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.template_collections c
    WHERE c.id = collection_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Owners can update their collection items"
  ON public.template_collection_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.template_collections c
    WHERE c.id = collection_id AND c.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.template_collections c
    WHERE c.id = collection_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Owners can delete their collection items"
  ON public.template_collection_items FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.template_collections c
    WHERE c.id = collection_id AND c.user_id = auth.uid()
  ));

CREATE TRIGGER update_template_collections_updated_at
  BEFORE UPDATE ON public.template_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX template_collection_items_collection_idx
  ON public.template_collection_items (collection_id, position);
