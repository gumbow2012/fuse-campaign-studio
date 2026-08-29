ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS event_name text,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS path text,
  ADD COLUMN IF NOT EXISTS referrer text,
  ADD COLUMN IF NOT EXISTS props jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.analytics_events ALTER COLUMN event_type DROP NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_event_name_idx ON public.analytics_events (event_name);

GRANT SELECT, INSERT ON public.analytics_events TO authenticated;
GRANT INSERT ON public.analytics_events TO anon;
GRANT ALL ON public.analytics_events TO service_role;

DROP POLICY IF EXISTS "Anyone can record analytics events" ON public.analytics_events;
CREATE POLICY "Anyone can record analytics events"
ON public.analytics_events FOR INSERT TO anon, authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.analytics_event_counts(_days integer DEFAULT 30)
RETURNS TABLE(event_name text, events bigint, sessions bigint, users bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(e.event_name, e.event_type, 'unknown') AS event_name,
         count(*)::bigint,
         count(DISTINCT e.session_id)::bigint,
         count(DISTINCT e.user_id)::bigint
  FROM public.analytics_events e
  WHERE public.has_role(auth.uid(), 'admin')
    AND e.created_at >= now() - (GREATEST(COALESCE(_days, 30), 1) || ' days')::interval
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT 50
$$;

CREATE OR REPLACE FUNCTION public.analytics_daily(_days integer DEFAULT 30)
RETURNS TABLE(day date, events bigint, sessions bigint, users bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (e.created_at AT TIME ZONE 'utc')::date AS day,
         count(*)::bigint,
         count(DISTINCT e.session_id)::bigint,
         count(DISTINCT e.user_id)::bigint
  FROM public.analytics_events e
  WHERE public.has_role(auth.uid(), 'admin')
    AND e.created_at >= now() - (GREATEST(COALESCE(_days, 30), 1) || ' days')::interval
  GROUP BY 1
  ORDER BY 1
$$;

CREATE OR REPLACE FUNCTION public.analytics_top_paths(_days integer DEFAULT 30)
RETURNS TABLE(path text, views bigint, sessions bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(e.path, '(unknown)') AS path,
         count(*)::bigint,
         count(DISTINCT e.session_id)::bigint
  FROM public.analytics_events e
  WHERE public.has_role(auth.uid(), 'admin')
    AND e.created_at >= now() - (GREATEST(COALESCE(_days, 30), 1) || ' days')::interval
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT 50
$$;

REVOKE ALL ON FUNCTION public.analytics_event_counts(integer) FROM public;
REVOKE ALL ON FUNCTION public.analytics_daily(integer) FROM public;
REVOKE ALL ON FUNCTION public.analytics_top_paths(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.analytics_event_counts(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_daily(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_top_paths(integer) TO authenticated;