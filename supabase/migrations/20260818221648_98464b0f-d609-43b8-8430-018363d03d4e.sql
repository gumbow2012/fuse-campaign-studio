CREATE TABLE public.node_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_id uuid NOT NULL,
  node_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  provider text,
  provider_model text,
  provider_request_id text,
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_url text,
  output_type text,
  error_log text,
  estimated_credits integer,
  estimated_cost_usd numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX node_runs_node_id_created_at_idx ON public.node_runs (node_id, created_at DESC);
CREATE INDEX node_runs_provider_request_id_idx ON public.node_runs (provider_request_id);

GRANT SELECT ON public.node_runs TO authenticated;
GRANT ALL ON public.node_runs TO service_role;

ALTER TABLE public.node_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view their own single step runs"
ON public.node_runs FOR SELECT TO authenticated
USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_node_runs_updated_at
BEFORE UPDATE ON public.node_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();