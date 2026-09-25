-- =============================================================
-- Estadísticas de uso
--   · Esquema «analytics»: vistas con cifras AGREGADAS (sin emails, nombres ni ids de usuario). Las usan
--     Admin → Estadísticas (admin_stats) y Google Looker Studio.
--   · Rol «looker_reader»: solo puede leer esas vistas. Se crea SIN contraseña (el repositorio es público):
--     el admin le pone una desde el SQL Editor (docs/DESARROLLO.md → «Estadísticas»).
--   · El esquema no se expone por la API REST (solo public), así que las vistas no son accesibles desde la app.
-- =============================================================

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

-- ---------- Uso diario (último año) ----------
create or replace view analytics.uso_diario as
with dias as (
  select d::date as dia from generate_series(current_date - 364, current_date, interval '1 day') d
),
ev as (
  select created_at::date as dia,
         count(distinct user_id) filter (where type = 'app_open') as activos,
         count(*) filter (where type = 'scan') as escaneos,
         count(*) filter (where type = 'scan' and detail = 'hit') as escaneos_reconocidos,
         count(*) filter (where type = 'scan' and detail = 'multi') as escaneos_varios,
         count(*) filter (where type = 'scan' and detail = 'unknown') as escaneos_desconocidos,
         count(*) filter (where type = 'finder_search') as busquedas
  from public.events where created_at > current_date - 365 group by 1
),
al as (select created_at::date as dia, count(*) as altas from public.profiles group by 1),
li as (select added_at::date as dia, count(*) as libros_anadidos from public.library group by 1),
de as (select added_at::date as dia, count(*) as deseos_anadidos from public.wishlist group by 1),
er as (select created_at::date as dia, count(*) as errores_app from public.client_errors group by 1)
select d.dia,
       coalesce(al.altas, 0)::int as altas,
       coalesce(ev.activos, 0)::int as activos,
       coalesce(ev.escaneos, 0)::int as escaneos,
       coalesce(ev.escaneos_reconocidos, 0)::int as escaneos_reconocidos,
       coalesce(ev.escaneos_varios, 0)::int as escaneos_varios,
       coalesce(ev.escaneos_desconocidos, 0)::int as escaneos_desconocidos,
       coalesce(ev.busquedas, 0)::int as busquedas,
       coalesce(li.libros_anadidos, 0)::int as libros_anadidos,
       coalesce(de.deseos_anadidos, 0)::int as deseos_anadidos,
       coalesce(er.errores_app, 0)::int as errores_app
from dias d
left join ev on ev.dia = d.dia
left join al on al.dia = d.dia
left join li on li.dia = d.dia
left join de on de.dia = d.dia
left join er on er.dia = d.dia;

-- ---------- Difusión: visitas y altas por canal y día ----------
create or replace view analytics.canales_diario as
with v as (select day as dia, ref as canal, sum(visits)::int as visitas from public.landing_visits group by 1, 2),
     a as (select created_at::date as dia, coalesce(signup_ref, 'directo') as canal, count(*)::int as altas
           from public.profiles group by 1, 2)
select coalesce(v.dia, a.dia) as dia, coalesce(v.canal, a.canal) as canal,
       coalesce(v.visitas, 0) as visitas, coalesce(a.altas, 0) as altas
from v full join a on a.dia = v.dia and a.canal = v.canal;

-- ---------- Catálogo: popularidad de cada libro ----------
create or replace view analytics.libros as
select c.code as codigo, c.title as titulo, c.series as serie, cat.name as categoria,
       c.catalog_date as fecha_publicacion, (c.cover_url is not null) as tiene_portada,
       (select count(*) from public.library l where l.catalog_id = c.id)::int as coleccionado,
       (select count(*) from public.wishlist w where w.catalog_id = c.id)::int as deseado,
       (select count(*) from public.book_marks m where m.catalog_id = c.id and m.read_at is not null)::int as leido,
       (select count(*) from public.book_marks m where m.catalog_id = c.id and m.played_at is not null)::int as jugado,
       (select count(*) from public.book_marks m where m.catalog_id = c.id and m.directed_at is not null)::int as dirigido
from public.catalog c
left join public.categories cat on cat.id = c.category_id
where c.status = 'approved';

-- ---------- Retención por semana de alta ----------
-- De los que se registraron cada semana: cuántos volvieron a abrir la app en las semanas 1, 2 y 4 siguientes
create or replace view analytics.retencion_semanal as
with u as (
  select id, date_trunc('week', created_at)::date as semana from public.profiles
  where created_at > now() - interval '26 weeks'
),
o as (select distinct user_id, date_trunc('week', created_at)::date as semana from public.events where type = 'app_open')
select u.semana as semana_alta,
       count(*)::int as usuarios,
       count(*) filter (where exists (select 1 from o where o.user_id = u.id and o.semana = u.semana + 7))::int as vuelven_semana_1,
       count(*) filter (where exists (select 1 from o where o.user_id = u.id and o.semana = u.semana + 14))::int as vuelven_semana_2,
       count(*) filter (where exists (select 1 from o where o.user_id = u.id and o.semana = u.semana + 28))::int as vuelven_semana_4
from u group by 1;

-- ---------- Salud: errores y avisos (Telegram guarda 7 días de avisos) ----------
create or replace view analytics.salud_diaria as
select d::date as dia,
       (select count(*) from public.client_errors e where e.created_at::date = d::date)::int as errores_app,
       (select count(distinct signature) from public.client_errors e where e.created_at::date = d::date)::int as errores_distintos,
       (select count(*) from public.admin_notifications n where n.created_at::date = d::date and n.status = 'ok')::int as avisos_ok,
       (select count(*) from public.admin_notifications n where n.created_at::date = d::date and n.status = 'failed')::int as avisos_fallidos
from generate_series(current_date - 89, current_date, interval '1 day') d;

-- ---------- Resumen de hoy (una fila) ----------
create or replace view analytics.resumen as
select current_date as fecha,
       (select count(*) from public.profiles)::int as usuarios,
       (select count(*) from public.profiles where is_supporter)::int as mecenas,
       (select count(*) from public.library)::int as libros_en_bibliotecas,
       (select count(distinct user_id) from public.library)::int as usuarios_con_libros,
       (select count(*) from public.wishlist)::int as deseos,
       (select count(*) from public.book_marks)::int as libros_marcados,
       (select count(*) from public.catalog where status = 'approved')::int as publicaciones,
       round(pg_database_size(current_database()) / 1024.0 / 1024.0, 1) as bd_mb;

-- ---------- Rol de solo lectura para Looker Studio ----------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'looker_reader') then
    create role looker_reader nologin;   -- sin contraseña: se activa a mano (ver docs)
  end if;
end;
$$;
grant usage on schema analytics to looker_reader;
grant select on all tables in schema analytics to looker_reader;
alter default privileges in schema analytics grant select on tables to looker_reader;
alter role looker_reader set statement_timeout = '30s';

-- ---------- Admin → Estadísticas ----------
-- Serie diaria del periodo elegido, totales del periodo anterior (para comparar), canales, retención y top de libros
create or replace function public.admin_stats(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public, analytics as $$
declare
  n int := least(greatest(coalesce(p_days, 30), 7), 365);
  result jsonb;
begin
  perform public.assert_admin();
  select jsonb_build_object(
    'days', n,
    'daily', (select coalesce(jsonb_agg(to_jsonb(u) order by u.dia), '[]') from analytics.uso_diario u where u.dia > current_date - n),
    'current', (select to_jsonb(t) from (select sum(altas)::int altas, sum(escaneos)::int escaneos, sum(escaneos_reconocidos)::int escaneos_reconocidos,
        sum(busquedas)::int busquedas, sum(libros_anadidos)::int libros_anadidos, sum(deseos_anadidos)::int deseos_anadidos, sum(errores_app)::int errores_app
        from analytics.uso_diario where dia > current_date - n) t),
    'previous', (select to_jsonb(t) from (select sum(altas)::int altas, sum(escaneos)::int escaneos, sum(escaneos_reconocidos)::int escaneos_reconocidos,
        sum(busquedas)::int busquedas, sum(libros_anadidos)::int libros_anadidos, sum(deseos_anadidos)::int deseos_anadidos, sum(errores_app)::int errores_app
        from analytics.uso_diario where dia <= current_date - n and dia > current_date - 2 * n) t),
    'active_current', (select count(distinct user_id) from public.events where type = 'app_open' and created_at > current_date - n),
    'active_previous', (select count(distinct user_id) from public.events where type = 'app_open'
        and created_at <= current_date - n and created_at > current_date - 2 * n),
    'channels', (select coalesce(jsonb_agg(to_jsonb(c) order by c.visitas desc, c.altas desc), '[]') from (
        select canal, sum(visitas)::int visitas, sum(altas)::int altas from analytics.canales_diario
        where dia > current_date - n group by canal) c),
    'retention', (select coalesce(jsonb_agg(to_jsonb(r) order by r.semana_alta), '[]') from analytics.retencion_semanal r
        where r.semana_alta > current_date - greatest(n, 56)),
    'top', jsonb_build_object(
      'coleccionado', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from (select codigo, titulo, coleccionado n from analytics.libros where coleccionado > 0 order by coleccionado desc, codigo limit 8) t),
      'deseado', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from (select codigo, titulo, deseado n from analytics.libros where deseado > 0 order by deseado desc, codigo limit 8) t),
      'jugado', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from (select codigo, titulo, (jugado + dirigido) n from analytics.libros where jugado + dirigido > 0 order by jugado + dirigido desc, codigo limit 8) t)
    ),
    'health', (select coalesce(jsonb_agg(to_jsonb(s) order by s.dia), '[]') from analytics.salud_diaria s where s.dia > current_date - n),
    'summary', (select to_jsonb(r) from analytics.resumen r)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_stats(int) from public, anon;
grant execute on function public.admin_stats(int) to authenticated;
