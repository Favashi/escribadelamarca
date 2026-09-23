-- =============================================================
-- Privacidad
--   · Minimización: el email deja de duplicarse en public.profiles (se lee de auth.users donde hace falta).
--   · Derecho de supresión: delete_my_account() borra la cuenta y, en cascada, todos sus datos
--     (perfil, biblioteca, deseos, préstamos, partidas, métricas). Libros y códigos propuestos
--     permanecen en el catálogo común sin autor (created_by → null).
-- =============================================================

-- ---------- Perfil sin email ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  paid boolean;
begin
  select exists (
    select 1 from public.donations
    where lower(new.email) = any(emails)
      and amount >= public.supporter_min_amount()
      and coalesce(live_mode, true)
  ) into paid;

  insert into public.profiles (id, display_name, avatar_url, is_supporter, supporter_since)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    paid,
    case when paid then now() end
  )
  on conflict (id) do nothing;

  if paid then
    update public.donations set matched = true where lower(new.email) = any(emails);
  end if;
  return new;
end;
$$;

alter table public.profiles drop column if exists email;

-- ---------- Borrar mi cuenta ----------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  -- Las tablas propias cuelgan de auth.users con ON DELETE CASCADE / SET NULL
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
