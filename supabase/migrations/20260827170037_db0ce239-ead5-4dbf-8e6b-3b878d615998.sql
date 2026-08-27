CREATE POLICY "Users create own brand activation reminders"
ON public.user_notifications
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND type = 'brand_activation');