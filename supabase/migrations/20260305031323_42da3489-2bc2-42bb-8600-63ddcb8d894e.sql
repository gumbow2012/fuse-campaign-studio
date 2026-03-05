CREATE POLICY "Admins can delete templates"
ON public.templates
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));