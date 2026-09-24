-- =============================================================
-- Portadas de los libros (permiso de La Marca del Este, septiembre de 2026)
--   · Bucket público «covers» en Supabase Storage (nunca en el repositorio: quedarían bajo AGPL).
--     Público porque el permiso es general «para la app»: más simple y cacheable.
--   · Solo el admin sube, cambia o borra (RLS en storage.objects). Cualquiera las ve por su URL pública.
--   · La app las reduce y comprime antes de subirlas (≈400 px, WebP/JPEG, 30–60 KB); el bucket admite hasta 1 MB.
--   · catalog.cover_url guarda la URL pública; el interruptor covers_enabled (Admin → Ajustes) las oculta al momento.
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists covers_admin_select on storage.objects;
create policy covers_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'covers' and (select public.is_admin()));
drop policy if exists covers_admin_insert on storage.objects;
create policy covers_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'covers' and (select public.is_admin()));
drop policy if exists covers_admin_update on storage.objects;
create policy covers_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'covers' and (select public.is_admin()))
  with check (bucket_id = 'covers' and (select public.is_admin()));
drop policy if exists covers_admin_delete on storage.objects;
create policy covers_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'covers' and (select public.is_admin()));
