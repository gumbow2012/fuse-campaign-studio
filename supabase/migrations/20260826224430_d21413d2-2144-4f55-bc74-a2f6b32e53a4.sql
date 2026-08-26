ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  body text,
  action_label text,
  action_url text,
  read_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.user_notifications;
CREATE POLICY "Users read own notifications"
ON public.user_notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.user_notifications;
CREATE POLICY "Users update own notifications"
ON public.user_notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx
  ON public.user_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_notifications_unread_idx
  ON public.user_notifications (user_id) WHERE read_at IS NULL;

ALTER TABLE public.user_notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.get_my_profile();

CREATE FUNCTION public.get_my_profile()
 RETURNS TABLE(id uuid, user_id uuid, email text, name text, avatar_url text, plan text, subscription_status text, credits_balance integer, stripe_customer_id text, stripe_subscription_id text, stripe_price_id text, subscription_period_start timestamp with time zone, subscription_period_end timestamp with time zone, subscription_cycle_credits integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.user_id, p.email, p.name, p.avatar_url, p.plan, p.subscription_status,
         p.credits_balance, p.stripe_customer_id,
         NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz, 0::integer
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1
$function$;