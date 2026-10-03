-- =============================================================
-- Administración de usuarios: suspender (reversible) y ficha de usuario.
--   · profiles.suspended_at / suspended_reason / suspended_by: el usuario suspendido no puede entrar (la app le enseña
--     un aviso) ni escribir nada: políticas RESTRICTIVE en las tablas que escribe, para que no se pueda saltar desde la
--     API. Sus datos y aportaciones se conservan. Los usuarios no pueden tocar estas columnas (no tienen permiso).
--   · admin_set_suspended(uid, motivo): suspender / reactivar (solo admin; no a sí mismo ni a otro admin) con aviso.
--   · admin_user_detail(uid): ficha con actividad, colección, aportaciones, nivel y Mecenas.
--   · admin_users() añade si está suspendido; la Comunidad y la lista de deseos compartida no enseñan a suspendidos.
-- =============================================================

alter table public.profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text check (char_length(suspended_reason) <= 300),
  add column if not exists suspended_by uuid references auth.users(id) on delete set null;

create or replace function public.is_suspended()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select suspended_at is not null from public.profiles where id = (select auth.uid())), false);
$$;
revoke all on function public.is_suspended() from public, anon;
grant execute on function public.is_suspended() to authenticated;

-- Bloqueo de escritura para suspendidos (se combina con AND con las políticas existentes)
do $$
declare
  t text;
begin
  foreach t in array array['library', 'wishlist', 'book_marks', 'catalog_suggestions', 'catalog_barcodes', 'catalog',
                           'feedback', 'user_achievements', 'events', 'loans', 'plays'] loop
    execute format('drop policy if exists %I on public.%I', t || '_not_suspended_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_not_suspended_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_not_suspended_del', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (not (select public.is_suspended()))', t || '_not_suspended_ins', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (not (select public.is_suspended()))', t || '_not_suspended_upd', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (not (select public.is_suspended()))', t || '_not_suspended_del', t);
  end loop;
end;
$$;
drop policy if exists profiles_not_suspended_upd on public.profiles;
create policy profiles_not_suspended_upd on public.profiles as restrictive for update to authenticated
  using (not (select public.is_suspended()));

create or replace function public.admin_set_suspended(p_user uuid, p_reason text default null, p_suspend boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare
  target public.profiles;
begin
  perform public.assert_admin();
  select * into target from public.profiles where id = p_user;
  if target.id is null then raise exception 'Usuario no encontrado'; end if;
  if p_user = auth.uid() then raise exception 'No puedes suspenderte a ti mismo'; end if;
  if target.is_admin then raise exception 'No se puede suspender a un administrador'; end if;
  update public.profiles
     set suspended_at = case when p_suspend then now() end,
         suspended_reason = case when p_suspend then nullif(btrim(left(p_reason, 300)), '') end,
         suspended_by = case when p_suspend then auth.uid() end
   where id = p_user;
  perform public.notify_admin(
    case when p_suspend then '⛔ <b>Usuario suspendido</b>: ' else '✅ <b>Usuario reactivado</b>: ' end
      || public.tg_esc(coalesce(target.public_name, target.display_name, 'sin nombre'))
      || case when p_suspend and nullif(btrim(p_reason), '') is not null then E'\nMotivo: ' || public.tg_esc(p_reason) else '' end,
    jsonb_build_object('silent', true));
end;
$$;
revoke all on function public.admin_set_suspended(uuid, text, boolean) from public, anon;
grant execute on function public.admin_set_suspended(uuid, text, boolean) to authenticated;

create or replace function public.admin_user_detail(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  perform public.assert_admin();
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'public_name', p.public_name,
    'email', u.email,
    'emblem', p.emblem,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'last_open', (select max(e.created_at) from public.events e where e.user_id = p.id and e.type = 'app_open'),
    'active_days', (select count(distinct e.created_at::date) from public.events e where e.user_id = p.id and e.type = 'app_open'),
    'signup_ref', p.signup_ref,
    'is_admin', p.is_admin,
    'is_supporter', p.is_supporter,
    'supporter_since', p.supporter_since,
    'donated', (select coalesce(sum(d.amount), 0) from public.donations d
                where coalesce(d.live_mode, true) and lower(u.email) = any(d.emails)),
    'suspended_at', p.suspended_at,
    'suspended_reason', p.suspended_reason,
    'books', (select count(*) from public.library l where l.user_id = p.id),
    'wishes', (select count(*) from public.wishlist w where w.user_id = p.id),
    'read', (select count(*) from public.book_marks m where m.user_id = p.id and m.read_at is not null),
    'played', (select count(*) from public.book_marks m where m.user_id = p.id and m.played_at is not null),
    'directed', (select count(*) from public.book_marks m where m.user_id = p.id and m.directed_at is not null),
    'scans', (select count(*) from public.events e where e.user_id = p.id and e.type = 'scan'),
    'searches', (select count(*) from public.events e where e.user_id = p.id and e.type = 'finder_search'),
    'top_series', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from (
        select c.series, count(*)::int as n from public.library l join public.catalog c on c.id = l.catalog_id
        where l.user_id = p.id and c.series is not null group by c.series order by count(*) desc, c.series limit 6) t),
    'xp', public.user_xp(p.id),
    'level', public.xp_level(public.user_xp(p.id)),
    'achievements', (select count(*) from public.user_achievements a where a.user_id = p.id),
    'contributions', jsonb_build_object(
      'approved', (select count(*) from public.catalog_suggestions s where s.created_by = p.id and s.status = 'approved')
                + (select count(*) from public.catalog_barcodes b where b.created_by = p.id and b.status = 'approved' and b.source = 'usuario')
                + (select count(*) from public.catalog k where k.created_by = p.id and k.status = 'approved' and k.source = 'app'),
      'pending', (select count(*) from public.catalog_suggestions s where s.created_by = p.id and s.status = 'pending')
               + (select count(*) from public.catalog_barcodes b where b.created_by = p.id and b.status = 'pending')
               + (select count(*) from public.catalog k where k.created_by = p.id and k.status = 'pending'),
      'rejected', (select count(*) from public.catalog_suggestions s where s.created_by = p.id and s.status = 'rejected')),
    'recent', (select coalesce(jsonb_agg(to_jsonb(r) order by r.at desc), '[]') from (
        select 'suggestion' as kind, s.status, s.created_at as at, s.catalog_id, c.code, c.title, s.changes
          from public.catalog_suggestions s join public.catalog c on c.id = s.catalog_id where s.created_by = p.id
        union all
        select 'code', b.status, b.created_at, b.catalog_id, c.code, c.title, jsonb_build_object('code', b.code)
          from public.catalog_barcodes b join public.catalog c on c.id = b.catalog_id
         where b.created_by = p.id and b.source = 'usuario'
        union all
        select 'book', k.status, k.created_at, k.id, k.code, k.title, null
          from public.catalog k where k.created_by = p.id and k.source = 'app'
        order by 3 desc limit 12) r)
  ) into result
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = p_user;
  if result is null then raise exception 'Usuario no encontrado'; end if;
  return result;
end;
$$;
revoke all on function public.admin_user_detail(uuid) from public, anon;
grant execute on function public.admin_user_detail(uuid) to authenticated;

-- Lista de usuarios con el estado de suspensión (cambia el tipo de retorno)
drop function if exists public.admin_users();
create function public.admin_users()
returns table (
  id uuid, display_name text, email text, created_at timestamptz, last_sign_in_at timestamptz,
  last_open timestamptz, books bigint, wishes bigint, plays bigint,
  is_supporter boolean, supporter_since timestamptz, is_admin boolean, donated numeric, suspended_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return query
  select u.id, coalesce(p.public_name, p.display_name), u.email::text, u.created_at, u.last_sign_in_at,
    (select max(e.created_at) from public.events e where e.user_id = u.id and e.type = 'app_open'),
    (select count(*) from public.library l where l.user_id = u.id),
    (select count(*) from public.wishlist w where w.user_id = u.id),
    (select count(*) from public.plays pl where pl.user_id = u.id),
    coalesce(p.is_supporter, false), p.supporter_since, coalesce(p.is_admin, false),
    (select coalesce(sum(d.amount), 0) from public.donations d
      where coalesce(d.live_mode, true) and lower(u.email) = any(d.emails)),
    p.suspended_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by u.created_at desc;
end;
$$;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

-- Comunidad y lista compartida: sin suspendidos
create or replace function public.scribes()
returns table (name text, suggestions int, codes int, books int, total int, is_me boolean,
               emblem text, xp int, level int, supporter boolean)
language sql stable security definer set search_path = public as $$
  with c as (
    select
      p.id, public.public_display_name(p) as shown, p.emblem,
      (p.is_supporter and p.show_in_supporters) as supporter,
      (select count(*) from public.catalog_suggestions s
        where s.created_by = p.id and s.status = 'approved')::int as suggestions,
      (select count(*) from public.catalog_barcodes b
        where b.created_by = p.id and b.status = 'approved' and b.source = 'usuario')::int as codes,
      (select count(*) from public.catalog k
        where k.created_by = p.id and k.status = 'approved' and k.source = 'app')::int as books,
      public.user_xp(p.id) as xp
    from public.profiles p
    where p.show_in_scribes and p.suspended_at is null
  )
  select shown, suggestions, codes, books, suggestions + codes + books,
         id = (select auth.uid()), emblem, xp, public.xp_level(xp), supporter
  from c
  where suggestions + codes + books > 0
  order by suggestions + codes + books desc, xp desc, 1
  limit 100;
$$;

create or replace function public.supporters()
returns table (name text, emblem text, since date, level int, is_me boolean)
language sql stable security definer set search_path = public as $$
  select public.public_display_name(p), p.emblem, p.supporter_since::date, public.xp_level(public.user_xp(p.id)),
         p.id = (select auth.uid())
  from public.profiles p
  where p.is_supporter and p.show_in_supporters and p.suspended_at is null
  order by p.supporter_since nulls last, 1
  limit 200;
$$;

create or replace function public.public_wishlist(p_token uuid)
returns table (owner_name text, code text, title text, category text, out_of_print boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.public_name, ''), p.display_name), c.code, c.title, cat.name, c.out_of_print
  from public.profiles p
  join public.wishlist w on w.user_id = p.id
  join public.catalog c on c.id = w.catalog_id
  left join public.categories cat on cat.id = c.category_id
  where p.share_token = p_token and p_token is not null and p.suspended_at is null
    and not exists (select 1 from public.library l where l.user_id = p.id and l.catalog_id = c.id)
  order by cat.sort_order, c.series, c.number, c.title;
$$;
