CREATE TABLE public.streetwear_references (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  image_url text,
  source_url text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.streetwear_references TO authenticated;
GRANT ALL ON public.streetwear_references TO service_role;

ALTER TABLE public.streetwear_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view streetwear references"
ON public.streetwear_references FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert streetwear references"
ON public.streetwear_references FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update streetwear references"
ON public.streetwear_references FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete streetwear references"
ON public.streetwear_references FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_streetwear_references_updated_at
BEFORE UPDATE ON public.streetwear_references
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();