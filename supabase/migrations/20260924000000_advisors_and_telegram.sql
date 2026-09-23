-- =============================================================
-- 1) Correcciones típicas de los Advisors de Supabase (seguridad y rendimiento)
-- 2) Avisos al administrador por Telegram (pg_net + Vault)
--
-- Configuración de Telegram (una sola vez, en el SQL Editor; NO en una migración):
--   select vault.create_secret('<TOKEN_DEL_BOT>', 'telegram_bot_token');
--   select vault.create_secret('<TU_CHAT_ID>',   'telegram_chat_id');
-- Sin esos secretos, los avisos simplemente no se envían.
-- =============================================================

-- ---------- Seguridad: search_path fijo en todas las funciones ----------
alter function public.supporter_min_amount() set search_path = public;
alter function public.stamp_approval()      set search_path = public;
alter function public.barcode_normalize()   set search_path = public;

-- Funciones auxiliares solo para usuarios con sesión (antes, ejecutables por anon: devolvían false)
revoke execute on function public.is_admin()     from public, anon;
revoke execute on function public.is_supporter() from public, anon;
grant  execute on function public.is_admin()     to authenticated;
grant  execute on function public.is_supporter() to authenticated;

-- ---------- Rendimiento: índices para claves foráneas ----------
create index if not exists library_catalog_idx     on public.library (catalog_id);
create index if not exists wishlist_catalog_idx    on public.wishlist (catalog_id);
create index if not exists loans_catalog_idx       on public.loans (catalog_id);
create index if not exists plays_catalog_idx       on public.plays (catalog_id);
create index if not exists catalog_created_by_idx  on public.catalog (created_by);
create index if not exists catalog_approved_by_idx on public.catalog (approved_by);
create index if not exists barcodes_created_by_idx on public.catalog_barcodes (created_by);
create index if not exists barcodes_approved_by_idx on public.catalog_barcodes (approved_by);

-- ---------- Rendimiento: auth.uid() evaluado una vez por consulta, no por fila ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists catalog_select on public.catalog;
create policy catalog_select on public.catalog for select to authenticated
  using (status = 'approved' or created_by = (select auth.uid()) or (select public.is_admin()));
drop policy if exists catalog_insert on public.catalog;
create policy catalog_insert on public.catalog for insert to authenticated
  with check ((select public.is_admin()) or (status = 'pending' and created_by = (select auth.uid())));
drop policy if exists catalog_update_admin on public.catalog;
create policy catalog_update_admin on public.catalog for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists catalog_delete on public.catalog;
create policy catalog_delete on public.catalog for delete to authenticated
  using ((select public.is_admin()) or (status = 'pending' and created_by = (select auth.uid())));

drop policy if exists library_own on public.library;
create policy library_own on public.library for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists wishlist_own on public.wishlist;
create policy wishlist_own on public.wishlist for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_supporter()))
  with check (user_id = (select auth.uid()) and (select public.is_supporter()));

drop policy if exists loans_own on public.loans;
create policy loans_own on public.loans for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_supporter()))
  with check (user_id = (select auth.uid()) and (select public.is_supporter()));

drop policy if exists plays_own on public.plays;
create policy plays_own on public.plays for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_supporter()))
  with check (user_id = (select auth.uid()) and (select public.is_supporter()));

drop policy if exists barcodes_select on public.catalog_barcodes;
create policy barcodes_select on public.catalog_barcodes for select to authenticated
  using (status = 'approved' or created_by = (select auth.uid()) or (select public.is_admin()));
drop policy if exists barcodes_insert on public.catalog_barcodes;
create policy barcodes_insert on public.catalog_barcodes for insert to authenticated
  with check ((select public.is_admin())
    or (status = 'pending' and source = 'usuario' and created_by = (select auth.uid()) and verified = false));
drop policy if exists barcodes_update on public.catalog_barcodes;
create policy barcodes_update on public.catalog_barcodes for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists barcodes_delete on public.catalog_barcodes;
create policy barcodes_delete on public.catalog_barcodes for delete to authenticated
  using ((select public.is_admin()) or (status = 'pending' and created_by = (select auth.uid())));

drop policy if exists events_insert_own on public.events;
create policy events_insert_own on public.events for insert to authenticated
  with check (user_id = (select auth.uid()));

-- categories: una política de lectura para todos y escritura solo admin (sin solaparse en SELECT)
drop policy if exists categories_admin on public.categories;
drop policy if exists categories_admin_insert on public.categories;
drop policy if exists categories_admin_update on public.categories;
drop policy if exists categories_admin_delete on public.categories;
create policy categories_admin_insert on public.categories for insert to authenticated with check ((select public.is_admin()));
create policy categories_admin_update on public.categories for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy categories_admin_delete on public.categories for delete to authenticated using ((select public.is_admin()));

-- =============================================================
-- Avisos por Telegram
-- =============================================================
create extension if not exists pg_net with schema extensions;

-- Envía un mensaje al chat del administrador. Nunca falla: si no hay secretos o Telegram no responde,
-- la operación que lo dispara sigue adelante (pg_net es asíncrono).
create or replace function public.notify_admin(p_text text)
returns void language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  v_token text;
  v_chat  text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'telegram_bot_token';
  select decrypted_secret into v_chat  from vault.decrypted_secrets where name = 'telegram_chat_id';
  if v_token is null or v_chat is null then
    return;
  end if;
  perform net.http_post(
    url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body    := jsonb_build_object('chat_id', v_chat, 'text', left(p_text, 3500), 'disable_web_page_preview', true),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then
  raise warning 'notify_admin: %', sqlerrm;
end;
$$;
revoke all on function public.notify_admin(text) from public, anon, authenticated;

create or replace function public.notify_on_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
begin
  if tg_table_name = 'profiles' then
    perform public.notify_admin('👤 Nuevo usuario en Escriba de la Marca: ' || coalesce(new.display_name, 'sin nombre'));

  elsif tg_table_name = 'catalog' and new.status = 'pending' then
    select display_name into who from public.profiles where id = new.created_by;
    perform public.notify_admin('📚 Libro propuesto: ' || coalesce(new.code || ' · ', '') || new.title
      || E'\nPor: ' || coalesce(who, 'desconocido') || E'\nRevísalo en Admin → Revisión.');

  elsif tg_table_name = 'catalog_barcodes' and new.status = 'pending' then
    select display_name into who from public.profiles where id = new.created_by;
    perform public.notify_admin('🏷️ Código propuesto: ' || new.code || ' → '
      || coalesce((select coalesce(c.code || ' · ', '') || c.title from public.catalog c where c.id = new.catalog_id), '?')
      || E'\nPor: ' || coalesce(who, 'desconocido') || E'\nRevísalo en Admin → Revisión.');

  elsif tg_table_name = 'donations' then
    perform public.notify_admin('☕ Donación recibida: ' || coalesce(new.amount::text, '?') || ' ' || coalesce(new.currency, '')
      || case when new.live_mode = false then ' (prueba)' else '' end
      || E'\nComprueba en Admin → Donaciones si se ha emparejado con una cuenta.');
  end if;
  return new;
end;
$$;

drop trigger if exists notify_new_profile on public.profiles;
create trigger notify_new_profile after insert on public.profiles
  for each row execute function public.notify_on_event();

drop trigger if exists notify_new_proposal on public.catalog;
create trigger notify_new_proposal after insert on public.catalog
  for each row when (new.status = 'pending') execute function public.notify_on_event();

drop trigger if exists notify_new_barcode on public.catalog_barcodes;
create trigger notify_new_barcode after insert on public.catalog_barcodes
  for each row when (new.status = 'pending') execute function public.notify_on_event();

drop trigger if exists notify_new_donation on public.donations;
create trigger notify_new_donation after insert on public.donations
  for each row execute function public.notify_on_event();
