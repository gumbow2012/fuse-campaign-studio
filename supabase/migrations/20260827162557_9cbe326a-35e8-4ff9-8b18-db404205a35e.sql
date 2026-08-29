CREATE POLICY "Public can read referral program settings"
ON public.referral_program_config
FOR SELECT
TO anon
USING (true);