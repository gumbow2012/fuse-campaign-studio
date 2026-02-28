-- Create a public bucket for template input uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('template-inputs', 'template-inputs', false)
ON CONFLICT (id) DO NOTHING;

-- Users can upload their own files (scoped to their user id folder)
CREATE POLICY "Users can upload own template inputs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'template-inputs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can read their own files
CREATE POLICY "Users can read own template inputs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'template-inputs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own files
CREATE POLICY "Users can delete own template inputs"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'template-inputs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);