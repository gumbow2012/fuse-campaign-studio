alter table public.fuse_templates
  add column if not exists preview_url text,
  add column if not exists preview_asset_type text;

update public.fuse_templates
set preview_asset_type = 'image'
where preview_url is not null
  and preview_asset_type is null;

alter table public.fuse_templates
  drop constraint if exists fuse_templates_preview_asset_type_check;

alter table public.fuse_templates
  add constraint fuse_templates_preview_asset_type_check
  check (
    preview_asset_type is null
    or preview_asset_type in ('image', 'video')
  );
