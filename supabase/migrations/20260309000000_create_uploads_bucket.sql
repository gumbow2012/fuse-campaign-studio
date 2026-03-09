-- Create public 'uploads' storage bucket for direct frontend uploads
-- This bypasses the Cloudflare Worker R2 binding (env.FUSE_ASSETS) which is not configured.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads',
  'uploads',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Allow authenticated users to upload files
create policy "Authenticated users can upload files"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'uploads');

-- Allow public read access so the worker can fetch uploaded images
create policy "Public read access for uploads"
  on storage.objects
  for select
  to public
  using (bucket_id = 'uploads');
