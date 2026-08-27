CREATE TABLE public.contests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  description text,
  prize text,
  cover_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','judging','closed')),
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.contests TO anon;
GRANT SELECT ON public.contests TO authenticated;
GRANT ALL ON public.contests TO service_role;

ALTER TABLE public.contests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view non-draft contests"
ON public.contests FOR SELECT
USING (status <> 'draft');

CREATE POLICY "Admins can manage contests"
ON public.contests FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_contests_updated_at
BEFORE UPDATE ON public.contests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX contests_board_idx ON public.contests (sort_order, starts_at);