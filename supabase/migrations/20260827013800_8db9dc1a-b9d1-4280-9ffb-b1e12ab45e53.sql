REVOKE EXECUTE ON FUNCTION public.touch_user_streak() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_user_streak() TO authenticated;