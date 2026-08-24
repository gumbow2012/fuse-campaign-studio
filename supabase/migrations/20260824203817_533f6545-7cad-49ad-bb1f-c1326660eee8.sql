CREATE TABLE public.cinema_control_tests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preset_id text NOT NULL,
  category text NOT NULL,
  model text NOT NULL,
  variable_a text NOT NULL,
  variable_b text NOT NULL,
  outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  test_date timestamp with time zone NOT NULL DEFAULT now(),
  evaluator_notes text,
  difference_score integer,
  consistency_score integer,
  support_type text,
  promotion text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cinema_control_tests TO authenticated;
GRANT ALL ON public.cinema_control_tests TO service_role;

ALTER TABLE public.cinema_control_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage their own control tests"
ON public.cinema_control_tests
FOR ALL
TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE INDEX cinema_control_tests_preset_idx ON public.cinema_control_tests (preset_id, created_at DESC);