-- =============================================================
-- Difusión
--   1. Lista de deseos para todos (antes solo Mecenas): cada lista compartida es publicidad de la app.
--   2. De dónde vienen los usuarios: canal de origen (?ref=…) guardado al registrarse (profiles.signup_ref)
--      y contador anónimo de visitas a la portada por canal y día (landing_visits: sin IP, sin cookies,
--      sin usuario; solo el recuento). Se ve en Admin → Resumen.
-- =============================================================

-- ---------- 1. Lista de deseos para todos ----------
drop policy if exists wishlist_own on public.wishlist;
create policy wishlist_own on public.wishlist for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- 2. Canal de origen ----------
-- Normaliza un canal: minúsculas, letras/números/guion; vacío → null; raro → 'otro'
create or replace function public.clean_ref(p_ref text)
returns text language sql immutable set search_path = '' as $$
  select case
    when nullif(trim(coalesce(p_ref, '')), '') is null then null
    when lower(trim(p_ref)) ~ '^[a-z0-9_-]{1,30}$' then lower(trim(p_ref))
    else 'otro' end;
$$;

alter table public.profiles add column if not exists signup_ref text
  check (signup_ref is null or signup_ref ~ '^[a-z0-9_-]{1,30}$');
grant update (signup_ref) on public.profiles to authenticated;

create table if not exists public.landing_visits (
  day     date not null default current_date,
  ref     text not null default 'directo',
  visits  int not null default 0,
  primary key (day, ref)
);
alter table public.landing_visits enable row level security;   -- sin políticas: solo funciones
grant all on public.landing_visits to service_role;

-- Suma una visita a la portada (una por navegador y día; lo controla la app con localStorage).
-- Contra abusos de la clave pública: como mucho 50 canales distintos por día (el resto cuenta como «otro»)
-- y 10.000 visitas por canal y día.
create or replace function public.track_landing(p_ref text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ref text := coalesce(public.clean_ref(p_ref), 'directo');
begin
  if not exists (select 1 from public.landing_visits where day = current_date and ref = v_ref)
     and (select count(*) from public.landing_visits where day = current_date) >= 50 then
    v_ref := 'otro';
  end if;
  insert into public.landing_visits (day, ref, visits)
  values (current_date, v_ref, 1)
  on conflict (day, ref) do update set visits = public.landing_visits.visits + 1
    where public.landing_visits.visits < 10000;
end;
$$;
revoke all on function public.track_landing(text) from public;
grant execute on function public.track_landing(text) to anon, authenticated;

-- Admin: visitas y altas por canal (30 y 90 días)
create or replace function public.admin_acquisition()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  perform public.assert_admin();
  with v as (
    select ref, sum(visits)::int as visits_30d from public.landing_visits
    where day > current_date - 30 group by ref
  ), s as (
    select coalesce(signup_ref, 'directo') as ref,
           count(*) filter (where created_at > now() - interval '30 days')::int as signups_30d,
           count(*) filter (where created_at > now() - interval '90 days')::int as signups_90d
    from public.profiles group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'ref', coalesce(v.ref, s.ref),
           'visits_30d', coalesce(v.visits_30d, 0),
           'signups_30d', coalesce(s.signups_30d, 0),
           'signups_90d', coalesce(s.signups_90d, 0))
         order by coalesce(v.visits_30d, 0) + coalesce(s.signups_90d, 0) desc), '[]'::jsonb)
    into result
  from v full join s on s.ref = v.ref
  where coalesce(v.visits_30d, 0) + coalesce(s.signups_90d, 0) > 0;
  return result;
end;
$$;
revoke all on function public.admin_acquisition() from public, anon;
grant execute on function public.admin_acquisition() to authenticated;
