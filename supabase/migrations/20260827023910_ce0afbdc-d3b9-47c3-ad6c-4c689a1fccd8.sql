CREATE TABLE IF NOT EXISTS public.cinema_batch_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  usd_ceiling numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cinema_batch_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  preset_id text NOT NULL,
  category text NOT NULL,
  name text,
  scene text NOT NULL DEFAULT 'PORTRAIT',
  kind text NOT NULL DEFAULT 'still',
  status text NOT NULL DEFAULT 'pending',
  generated_src text,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (preset_id, kind)
);

CREATE INDEX IF NOT EXISTS cinema_batch_queue_pending_idx
  ON public.cinema_batch_queue (status, kind, created_at);

CREATE TABLE IF NOT EXISTS public.cinema_batch_spend (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  preset_id text NOT NULL,
  kind text NOT NULL DEFAULT 'still',
  usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.cinema_batch_config TO service_role;
GRANT ALL ON public.cinema_batch_queue TO service_role;
GRANT ALL ON public.cinema_batch_spend TO service_role;

ALTER TABLE public.cinema_batch_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cinema_batch_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cinema_batch_spend ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read cinema batch queue" ON public.cinema_batch_queue;
CREATE POLICY "Admins can read cinema batch queue"
  ON public.cinema_batch_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can read cinema batch spend" ON public.cinema_batch_spend;
CREATE POLICY "Admins can read cinema batch spend"
  ON public.cinema_batch_spend FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.cinema_batch_queue TO authenticated;
GRANT SELECT ON public.cinema_batch_spend TO authenticated;