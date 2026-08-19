create policy "Users manage own outfit-swap files"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'fuse-assets'
  and (storage.foldername(name))[1] = 'system'
  and (storage.foldername(name))[2] = 'outfit-swap'
  and (storage.foldername(name))[3] = (auth.uid())::text
)
with check (
  bucket_id = 'fuse-assets'
  and (storage.foldername(name))[1] = 'system'
  and (storage.foldername(name))[2] = 'outfit-swap'
  and (storage.foldername(name))[3] = (auth.uid())::text
);