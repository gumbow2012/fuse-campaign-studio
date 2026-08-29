CREATE TABLE public.user_streaks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_active_on date,
  total_active_days integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_streaks TO authenticated;
GRANT ALL ON public.user_streaks TO service_role;

ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own streak"
ON public.user_streaks FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_user_streak()
RETURNS public.user_streaks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  row public.user_streaks;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.user_streaks (user_id, current_streak, longest_streak, last_active_on, total_active_days, updated_at)
  VALUES (uid, 1, 1, today, 1, now())
  ON CONFLICT (user_id) DO UPDATE SET
    current_streak = CASE
      WHEN public.user_streaks.last_active_on = today THEN public.user_streaks.current_streak
      WHEN public.user_streaks.last_active_on = today - 1 THEN public.user_streaks.current_streak + 1
      ELSE 1 END,
    longest_streak = GREATEST(
      public.user_streaks.longest_streak,
      CASE
        WHEN public.user_streaks.last_active_on = today THEN public.user_streaks.current_streak
        WHEN public.user_streaks.last_active_on = today - 1 THEN public.user_streaks.current_streak + 1
        ELSE 1 END),
    total_active_days = CASE
      WHEN public.user_streaks.last_active_on = today THEN public.user_streaks.total_active_days
      ELSE public.user_streaks.total_active_days + 1 END,
    last_active_on = today,
    updated_at = now()
  RETURNING * INTO row;

  RETURN row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_user_streak() TO authenticated;