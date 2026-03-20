do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'authenticated_upload_fuse_assets'
  ) then
    create policy "authenticated_upload_fuse_assets"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'fuse-assets'
        and auth.uid() is not null
        and name like auth.uid()::text || '/%'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'authenticated_select_fuse_assets'
  ) then
    create policy "authenticated_select_fuse_assets"
      on storage.objects for select to authenticated
      using (
        bucket_id = 'fuse-assets'
        and auth.uid() is not null
        and name like auth.uid()::text || '/%'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'authenticated_delete_fuse_assets'
  ) then
    create policy "authenticated_delete_fuse_assets"
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'fuse-assets'
        and auth.uid() is not null
        and name like auth.uid()::text || '/%'
      );
  end if;
end $$;
