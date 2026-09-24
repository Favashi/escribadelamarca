-- =============================================================
-- Monitorización sin servicios externos (Supabase + GitHub + Telegram)
--   · client_errors: errores de JavaScript de los navegadores (js/errors.js). Sin datos personales:
--     mensaje, origen (fichero:línea), pila recortada, pantalla, versión y navegador. Se puede insertar
--     con o sin sesión (los fallos de la portada también importan), con límites contra abusos.
--     Aviso por Telegram la primera vez que aparece cada error (por firma) cada 24 h.
--   · notify_admin_once(): avisos con clave que no se repiten dentro de un intervalo
--     (la usa también la Edge Function de Buy Me a Coffee).
--   · Resumen semanal: tamaño de la base de datos frente al límite del plan y errores de la semana.
-- =============================================================

-- ---------- Avisos sin repetición ----------
create or replace function public.notify_admin_once(p_key text, p_text text, p_within interval default '24 hours',
                                                    p_opts jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.admin_notifications
             where opts->>'key' = p_key and created_at > now() - p_within) then
    return false;
  end if;
  perform public.notify_admin(p_text, coalesce(p_opts, '{}'::jsonb) || jsonb_build_object('key', p_key));
  return true;
end;
$$;
revoke all on function public.notify_admin_once(text, text, interval, jsonb) from public, anon, authenticated;
grant execute on function public.notify_admin_once(text, text, interval, jsonb) to service_role;
grant execute on function public.notify_admin(text, jsonb) to service_role;

-- admin_notifications se purga a los 7 días: para deduplicar hasta 24 h basta
create index if not exists admin_notifications_key_idx on public.admin_notifications ((opts->>'key'), created_at);

-- ---------- Errores del navegador ----------
create table if not exists public.client_errors (
  id           bigserial primary key,
  user_id      uuid default auth.uid() references auth.users(id) on delete set null,
  kind         text not null default 'error' check (kind in ('error', 'rejection', 'resource', 'boot')),
  message      text not null check (char_length(message) between 1 and 500),
  source       text check (char_length(source) <= 300),       -- fichero:línea:columna
  stack        text check (char_length(stack) <= 2000),
  page         text check (char_length(page) <= 100),         -- ruta (#/biblioteca…), sin parámetros
  app_version  text check (char_length(app_version) <= 20),
  user_agent   text check (char_length(user_agent) <= 300),
  signature    text,                                          -- la calcula el trigger
  created_at   timestamptz not null default now()
);
create index if not exists client_errors_time_idx on public.client_errors (created_at desc);
create index if not exists client_errors_sig_idx on public.client_errors (signature, created_at desc);
create index if not exists client_errors_user_idx on public.client_errors (user_id);

grant insert on public.client_errors to anon, authenticated;
grant usage on sequence public.client_errors_id_seq to anon, authenticated;
grant select, delete on public.client_errors to authenticated;   -- RLS: solo admin
grant all on public.client_errors to service_role;
alter table public.client_errors enable row level security;

drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
drop policy if exists client_errors_admin_select on public.client_errors;
create policy client_errors_admin_select on public.client_errors for select to authenticated
  using ((select public.is_admin()));
drop policy if exists client_errors_admin_delete on public.client_errors;
create policy client_errors_admin_delete on public.client_errors for delete to authenticated
  using ((select public.is_admin()));

-- Antes de guardar: firma, límites (se descarta en silencio lo que pase de ellos) y limpieza
create or replace function public.client_errors_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Nunca guardar emails aunque aparezcan en un mensaje
  new.message := regexp_replace(new.message, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<email>', 'g');
  new.stack := regexp_replace(new.stack, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<email>', 'g');
  new.created_at := now();
  -- Firma: mismo error = mismo mensaje (sin números variables) y mismo fichero
  new.signature := md5(new.kind || '|' || regexp_replace(new.message, '[0-9]+', 'N', 'g') || '|'
                       || coalesce(regexp_replace(new.source, ':[0-9]+(:[0-9]+)?$', ''), ''));
  if (select count(*) from public.client_errors where created_at > now() - interval '1 hour') >= 300 then
    return null;                                        -- tope global por hora
  end if;
  if new.user_id is not null and (select count(*) from public.client_errors
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
    return null;                                        -- tope por usuario y hora
  end if;
  return new;
end;
$$;
revoke all on function public.client_errors_before_insert() from public, anon, authenticated;

drop trigger if exists client_errors_before_insert on public.client_errors;
create trigger client_errors_before_insert before insert on public.client_errors
  for each row execute function public.client_errors_before_insert();

-- Después de guardar: aviso por Telegram de los errores nuevos (una vez al día por firma, máx. 10 avisos por hora)
create or replace function public.notify_client_error()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n_same int;
  n_users int;
  device text;
begin
  if (select count(*) from public.admin_notifications
      where opts->>'key' like 'client_error:%' and created_at > now() - interval '1 hour') >= 10 then
    return new;
  end if;
  select count(*), count(distinct user_id) into n_same, n_users
    from public.client_errors where signature = new.signature and created_at > now() - interval '7 days';
  device := case when new.user_agent ~ 'iPhone|iPad' then 'iPhone/iPad' when new.user_agent ~ 'Android' then 'Android'
                 when new.user_agent ~ 'Mac' then 'Mac' when new.user_agent ~ 'Windows' then 'Windows' else 'otro' end;
  perform public.notify_admin_once('client_error:' || new.signature,
    '🧯 <b>Error en la app</b>'
    || case new.kind when 'boot' then ' (no llegó a arrancar)' when 'resource' then ' (no cargó un fichero)'
                     when 'rejection' then ' (promesa sin gestionar)' else '' end || E'\n'
    || '<code>' || public.tg_esc(left(new.message, 300)) || '</code>'
    || coalesce(E'\nEn: ' || public.tg_esc(new.source), '')
    || coalesce(E'\nPantalla: ' || public.tg_esc(new.page), '')
    || E'\n<i>v' || public.tg_esc(coalesce(new.app_version, '?')) || ' · ' || device
    || case when new.user_id is null then ' · sin sesión' else '' end || '</i>'
    || case when n_same > 1 then E'\nVisto ' || n_same || ' veces (' || n_users || ' usuarios) en 7 días' else '' end
    || E'\nDetalle: Supabase → Table Editor → client_errors',
    '24 hours');
  return new;
end;
$$;
revoke all on function public.notify_client_error() from public, anon, authenticated;

drop trigger if exists notify_client_error on public.client_errors;
create trigger notify_client_error after insert on public.client_errors
  for each row execute function public.notify_client_error();

-- ---------- Resumen semanal ampliado ----------
-- Se reescribe entero (misma firma); añade tamaño de la base de datos y errores de la app, y purga errores de >90 días.
create or replace function public.weekly_admin_digest()
returns void language plpgsql security definer set search_path = public as $$
declare
  since timestamptz := now() - interval '7 days';
  u_total int; u_new int; u_active int;
  scans int; scans_unknown int; added int; searches int;
  p_books int; p_codes int; p_sugg int; p_fb int; oldest timestamptz;
  don text; failed int;
  pend text;
  db_mb numeric; db_pct int;
  err_total int; err_kinds int; err_top text;
begin
  delete from public.client_errors where created_at < now() - interval '90 days';

  select count(*), count(*) filter (where created_at > since) into u_total, u_new from public.profiles;
  select count(distinct user_id) filter (where type = 'app_open'),
         count(*) filter (where type = 'scan'),
         count(*) filter (where type = 'scan' and detail = 'unknown'),
         count(*) filter (where type = 'finder_search')
    into u_active, scans, scans_unknown, searches
    from public.events where created_at > since;
  select count(*) into added from public.library where added_at > since;

  select count(*) into p_books from public.catalog where status = 'pending';
  select count(*) into p_codes from public.catalog_barcodes where status = 'pending';
  select count(*) into p_sugg from public.catalog_suggestions where status = 'pending';
  select count(*) into p_fb from public.feedback where status = 'new';
  select min(t) into oldest from (
    select created_at t from public.catalog where status = 'pending'
    union all select created_at from public.catalog_barcodes where status = 'pending'
    union all select created_at from public.catalog_suggestions where status = 'pending'
    union all select created_at from public.feedback where status = 'new') x;

  select string_agg(n || ' · ' || to_char(s, 'FM999990.00') || ' ' || coalesce(currency, ''), ' + ') into don
    from (select currency, count(*) n, sum(amount) s from public.donations
           where created_at > since and coalesce(live_mode, true)
             and type in ('donation.created', 'membership.started', 'recurring_donation.started', 'extra_purchase.created')
           group by currency) d;
  select count(*) into failed from public.admin_notifications where status = 'failed' and created_at > since;

  -- Plan gratuito: 500 MB de base de datos
  db_mb := round(pg_database_size(current_database()) / 1024.0 / 1024.0, 1);
  db_pct := round(db_mb / 500 * 100);

  select count(*), count(distinct signature) into err_total, err_kinds from public.client_errors where created_at > since;
  select string_agg('• ' || public.tg_esc(left(m, 80)) || ' (' || n || ')', E'\n') into err_top
    from (select min(message) m, count(*) n from public.client_errors where created_at > since
          group by signature order by count(*) desc limit 3) t;

  pend := concat_ws(', ',
    case when p_books > 0 then p_books || case when p_books = 1 then ' libro' else ' libros' end end,
    case when p_codes > 0 then p_codes || case when p_codes = 1 then ' código' else ' códigos' end end,
    case when p_sugg > 0 then p_sugg || case when p_sugg = 1 then ' sugerencia' else ' sugerencias' end end,
    case when p_fb > 0 then p_fb || case when p_fb = 1 then ' comentario' else ' comentarios' end end);

  perform public.notify_admin(
    '📊 <b>Resumen semanal</b> · ' || to_char(since, 'DD/MM') || '–' || to_char(now(), 'DD/MM')
    || E'\n👥 Usuarios: ' || u_total || ' (+' || u_new || ') · activos: ' || u_active
    || E'\n📷 Escaneos: ' || scans || case when scans_unknown > 0 then ' (' || scans_unknown || case when scans_unknown = 1 then ' desconocido)' else ' desconocidos)' end else '' end
    || ' · libros añadidos: ' || added
    || E'\n🧭 Búsquedas de aventuras: ' || searches
    || E'\n☕ Donaciones: ' || coalesce(don, 'ninguna')
    || case when pend = '' then E'\n✓ Nada pendiente de revisar'
            else E'\n📝 <b>Pendiente</b>: ' || pend
              || case when oldest < now() - interval '3 days'
                      then ' · el más antiguo, de hace ' || extract(day from now() - oldest)::int || ' días' else '' end end
    || case when err_total = 0 then E'\n✓ Sin errores en la app'
            else E'\n🧯 <b>Errores en la app</b>: ' || err_total || ' (' || err_kinds
                 || case when err_kinds = 1 then ' distinto)' else ' distintos)' end || coalesce(E'\n' || err_top, '') end
    || E'\n💾 Base de datos: ' || db_mb || ' MB de 500 (' || db_pct || ' %)' || case when db_pct >= 80 then ' ⚠️' else '' end
    || case when failed > 0 then E'\n⚠️ Avisos de Telegram que no llegaron: ' || failed
                                 || E' (<code>select * from admin_notifications where status = ''failed''</code>)' else '' end,
    jsonb_build_object('buttons', public.tg_button('Abrir Admin', '#/admin')));
end;
$$;
revoke all on function public.weekly_admin_digest() from public, anon, authenticated;
