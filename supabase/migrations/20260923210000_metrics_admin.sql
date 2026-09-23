-- =============================================================
-- Métricas de uso y backoffice de administración
--   · events: eventos de uso mínimos (apertura diaria, escaneos, búsquedas, compartir)
--     Cada usuario solo puede INSERTAR los suyos; nadie puede leerlos desde la app.
--     Se purgan a los 12 meses.
--   · admin_*: funciones que solo responden a administradores.
-- =============================================================

create table if not exists public.events (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type        text not null check (type in ('app_open', 'scan', 'finder_search', 'wishlist_share')),
  detail      text check (char_length(detail) <= 40),
  created_at  timestamptz not null default now()
);
create index if not exists events_type_time_idx on public.events (type, created_at);
create index if not exists events_user_idx on public.events (user_id, created_at);

grant insert on public.events to authenticated;
grant usage on sequence public.events_id_seq to authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;
drop policy if exists events_insert_own on public.events;
create policy events_insert_own on public.events for insert to authenticated
  with check (user_id = auth.uid());
-- Sin política de SELECT: los eventos solo se leen agregados desde admin_metrics().

-- ---------- Helpers ----------
create or replace function public.assert_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Solo para administradores' using errcode = '42501';
  end if;
end;
$$;

-- ---------- Métricas agregadas ----------
create or replace function public.admin_metrics()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
begin
  perform public.assert_admin();
  delete from public.events where created_at < now() - interval '12 months';

  with weeks as (
    select generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') as wk
  )
  select jsonb_build_object(
    'generated_at', now(),
    'users', jsonb_build_object(
      'total',    (select count(*) from auth.users),
      'new_7d',   (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'new_30d',  (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'active_1d',  (select count(distinct user_id) from public.events where type = 'app_open' and created_at > now() - interval '1 day'),
      'active_7d',  (select count(distinct user_id) from public.events where type = 'app_open' and created_at > now() - interval '7 days'),
      'active_30d', (select count(distinct user_id) from public.events where type = 'app_open' and created_at > now() - interval '30 days'),
      'supporters', (select count(*) from public.profiles where is_supporter),
      'with_books', (select count(distinct user_id) from public.library)
    ),
    'library', jsonb_build_object(
      'entries',   (select count(*) from public.library),
      'added_7d',  (select count(*) from public.library where added_at > now() - interval '7 days'),
      'added_30d', (select count(*) from public.library where added_at > now() - interval '30 days'),
      'wishes',    (select count(*) from public.wishlist),
      'plays',     (select count(*) from public.plays)
    ),
    'scans', jsonb_build_object(
      'total_30d', (select count(*) from public.events where type = 'scan' and created_at > now() - interval '30 days'),
      'hit_30d',     (select count(*) from public.events where type = 'scan' and detail = 'hit' and created_at > now() - interval '30 days'),
      'multi_30d',   (select count(*) from public.events where type = 'scan' and detail = 'multi' and created_at > now() - interval '30 days'),
      'unknown_30d', (select count(*) from public.events where type = 'scan' and detail = 'unknown' and created_at > now() - interval '30 days'),
      'searches_30d', (select count(*) from public.events where type = 'finder_search' and created_at > now() - interval '30 days')
    ),
    'catalog', jsonb_build_object(
      'books',            (select count(*) from public.catalog where status = 'approved'),
      'pending_books',    (select count(*) from public.catalog where status = 'pending'),
      'pending_codes',    (select count(*) from public.catalog_barcodes where status = 'pending'),
      'verified_codes',   (select count(*) from public.catalog_barcodes where verified),
      'unverified_codes', (select count(*) from public.catalog_barcodes where status = 'approved' and not verified)
    ),
    'donations', jsonb_build_object(
      'count',     (select count(*) from public.donations where coalesce(live_mode, true)),
      'total',     (select coalesce(sum(amount), 0) from public.donations where coalesce(live_mode, true)),
      'unmatched', (select count(*) from public.donations where coalesce(live_mode, true) and not matched)
    ),
    'weekly', (
      select jsonb_agg(jsonb_build_object(
        'week', to_char(w.wk, 'YYYY-MM-DD'),
        'signups', (select count(*) from auth.users u where u.created_at >= w.wk and u.created_at < w.wk + interval '1 week'),
        'active',  (select count(distinct e.user_id) from public.events e where e.type = 'app_open' and e.created_at >= w.wk and e.created_at < w.wk + interval '1 week'),
        'added',   (select count(*) from public.library l where l.added_at >= w.wk and l.added_at < w.wk + interval '1 week'),
        'scans',   (select count(*) from public.events e where e.type = 'scan' and e.created_at >= w.wk and e.created_at < w.wk + interval '1 week')
      ) order by w.wk)
      from weeks w
    ),
    'top_owned', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select c.code, c.title, count(*) as n
        from public.library l join public.catalog c on c.id = l.catalog_id
        group by c.id order by n desc, c.title limit 10) t
    ),
    'top_wished', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select c.code, c.title, count(*) as n
        from public.wishlist w join public.catalog c on c.id = w.catalog_id
        group by c.id order by n desc, c.title limit 10) t
    )
  ) into result;
  return result;
end;
$$;

-- ---------- Usuarios ----------
create or replace function public.admin_users()
returns table (
  id uuid, display_name text, email text, created_at timestamptz, last_sign_in_at timestamptz,
  last_open timestamptz, books bigint, wishes bigint, plays bigint,
  is_supporter boolean, supporter_since timestamptz, is_admin boolean, donated numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return query
  select u.id, p.display_name, u.email::text, u.created_at, u.last_sign_in_at,
    (select max(e.created_at) from public.events e where e.user_id = u.id and e.type = 'app_open'),
    (select count(*) from public.library l where l.user_id = u.id),
    (select count(*) from public.wishlist w where w.user_id = u.id),
    (select count(*) from public.plays pl where pl.user_id = u.id),
    coalesce(p.is_supporter, false), p.supporter_since, coalesce(p.is_admin, false),
    (select coalesce(sum(d.amount), 0) from public.donations d
      where coalesce(d.live_mode, true) and lower(u.email) = any(d.emails))
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by u.created_at desc;
end;
$$;

create or replace function public.admin_set_supporter(p_user uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update public.profiles
     set is_supporter = p_value,
         supporter_since = case when p_value then coalesce(supporter_since, now()) else null end
   where id = p_user;
end;
$$;

-- ---------- Donaciones ----------
create or replace function public.admin_donations()
returns table (id bigint, created_at timestamptz, provider text, type text, email text,
               amount numeric, currency text, matched boolean, live_mode boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return query
  select d.id, d.created_at, d.provider, d.type, d.email, d.amount, d.currency, d.matched, d.live_mode
  from public.donations d
  order by d.created_at desc
  limit 200;
end;
$$;

-- Marca una donación como emparejada y hace Mecenas al usuario elegido
create or replace function public.admin_match_donation(p_donation bigint, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update public.donations set matched = true where id = p_donation;
  perform public.admin_set_supporter(p_user, true);
end;
$$;

revoke all on function public.assert_admin() from public;
revoke all on function public.admin_metrics() from public;
revoke all on function public.admin_users() from public;
revoke all on function public.admin_set_supporter(uuid, boolean) from public;
revoke all on function public.admin_donations() from public;
revoke all on function public.admin_match_donation(bigint, uuid) from public;
grant execute on function public.assert_admin() to authenticated;
grant execute on function public.admin_metrics() to authenticated;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.admin_set_supporter(uuid, boolean) to authenticated;
grant execute on function public.admin_donations() to authenticated;
grant execute on function public.admin_match_donation(bigint, uuid) to authenticated;
