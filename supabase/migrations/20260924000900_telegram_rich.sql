-- =============================================================
-- Avisos de Telegram más útiles
--   · Formato HTML (negritas, códigos en monospace) y botón que abre la pantalla de la app que toca.
--   · Más contexto: nº de usuario, EAN válido o no y posibles duplicados, fiabilidad de quien propone
--     (aportaciones aceptadas), antes → después de cada campo sugerido, si una donación activa Mecenas
--     y a quién, reembolsos y cancelaciones, dispositivo en los comentarios.
--   · Sin sonido para lo rutinario (nuevos usuarios).
--   · Resumen semanal (lunes, pg_cron): uso, pendientes de revisar y avisos fallidos.
--   · Si Telegram rechaza el HTML (400), el reintento lo manda como texto plano.
-- =============================================================

alter table public.admin_notifications add column if not exists opts jsonb not null default '{}'::jsonb;

-- ---------- Utilidades ----------
-- Escapa texto para parse_mode HTML. Conserva null (para poder usar coalesce('…' || tg_esc(x), '')).
create or replace function public.tg_esc(p text)
returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(p, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

create or replace function public.app_url(p_hash text default '')
returns text language sql immutable set search_path = '' as $$
  select 'https://favashi.github.io/escribadelamarca/' || coalesce(p_hash, '');
$$;

-- Un botón con enlace a una pantalla de la app (formato inline_keyboard de Telegram)
create or replace function public.tg_button(p_label text, p_hash text)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_array(jsonb_build_array(jsonb_build_object('text', p_label, 'url', public.app_url(p_hash))));
$$;

create or replace function public.ean13_valid(p text)
returns boolean language sql immutable set search_path = '' as $$
  select case when coalesce(p, '') ~ '^[0-9]{13}$' then
    ((select sum(substr(p, i, 1)::int * case when i % 2 = 0 then 3 else 1 end) from generate_series(1, 12) i)
      + substr(p, 13, 1)::int) % 10 = 0
  else false end;
$$;

-- «Ana García (3 aportaciones aceptadas)»: ayuda a decidir cuánto fiarse de una propuesta.
-- Se cuenta igual que contributions() en js/achievements.js y scribes().
create or replace function public.tg_who(p_uid uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_name text;
  n int;
begin
  if p_uid is null then return 'desconocido'; end if;
  select display_name into v_name from public.profiles where id = p_uid;
  n := (select count(*) from public.catalog_suggestions where created_by = p_uid and status = 'approved')
     + (select count(*) from public.catalog_barcodes where created_by = p_uid and status = 'approved' and source = 'usuario')
     + (select count(*) from public.catalog where created_by = p_uid and status = 'approved' and source = 'app');
  return public.tg_esc(coalesce(v_name, 'sin nombre')) || ' ('
    || case when n = 0 then 'ninguna aportación aceptada aún' when n = 1 then '1 aportación aceptada'
            else n || ' aportaciones aceptadas' end || ')';
end;
$$;

create or replace function public.tg_field_label(p_key text)
returns text language sql immutable set search_path = '' as $$
  select case p_key
    when 'title' then 'Título' when 'code' then 'Código' when 'author' then 'Autor' when 'pages' then 'Páginas'
    when 'min_level' then 'Nivel mín.' when 'max_level' then 'Nivel máx.' when 'min_players' then 'Jugadores mín.'
    when 'max_players' then 'Jugadores máx.' when 'sessions' then 'Sesiones' when 'tags' then 'Etiquetas'
    when 'summary' then 'Resumen' when 'category_id' then 'Categoría' when 'series' then 'Serie' when 'number' then 'Número'
    else p_key end;
$$;

-- ---------- Envío (sustituye a las versiones de un solo argumento) ----------
-- opts: { silent: bool, buttons: inline_keyboard, plain: bool (sin HTML) }
drop function if exists public.notify_admin(text);
drop function if exists public.telegram_send(text);

create or replace function public.telegram_send(p_text text, p_opts jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  v_token text;
  v_chat  text;
  v_body  jsonb;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'telegram_bot_token';
  select decrypted_secret into v_chat  from vault.decrypted_secrets where name = 'telegram_chat_id';
  if v_token is null or v_chat is null then
    return null;
  end if;
  v_body := jsonb_build_object(
    'chat_id', v_chat,
    'text', left(p_text, 3900),
    'disable_web_page_preview', true,
    'disable_notification', coalesce((p_opts->>'silent')::boolean, false));
  if not coalesce((p_opts->>'plain')::boolean, false) then
    v_body := v_body || '{"parse_mode": "HTML"}'::jsonb;
  end if;
  if p_opts ? 'buttons' then
    v_body := v_body || jsonb_build_object('reply_markup', jsonb_build_object('inline_keyboard', p_opts->'buttons'));
  end if;
  return net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := v_body,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 15000
  );
end;
$$;

create or replace function public.notify_admin(p_text text, p_opts jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  rid bigint;
begin
  rid := public.telegram_send(p_text, coalesce(p_opts, '{}'::jsonb));
  if rid is not null then
    insert into public.admin_notifications (text, opts, request_id) values (p_text, coalesce(p_opts, '{}'::jsonb), rid);
  end if;
exception when others then
  raise warning 'notify_admin: %', sqlerrm;
end;
$$;

-- Reintentos (máx. 3). Un 400 suele ser HTML que Telegram no acepta: se reenvía como texto plano.
create or replace function public.retry_admin_notifications()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  n record;
  resp record;
  v_plain text;
begin
  for n in select * from public.admin_notifications
           where status = 'sent' and created_at > now() - interval '1 day' and updated_at < now() - interval '1 minute'
  loop
    select status_code, error_msg into resp from net._http_response where id = n.request_id;
    if not found then
      continue;                                  -- aún sin respuesta (o ya purgada por pg_net)
    elsif resp.status_code = 200 then
      update public.admin_notifications set status = 'ok', updated_at = now() where id = n.id;
    elsif n.attempts >= 3 then
      update public.admin_notifications set status = 'failed', updated_at = now() where id = n.id;
    elsif resp.status_code = 400 and not coalesce((n.opts->>'plain')::boolean, false) then
      v_plain := replace(replace(replace(regexp_replace(n.text, '<[^>]+>', '', 'g'), '&lt;', '<'), '&gt;', '>'), '&amp;', '&');
      update public.admin_notifications
         set text = v_plain, opts = n.opts || '{"plain": true}'::jsonb,
             request_id = public.telegram_send(v_plain, n.opts || '{"plain": true}'::jsonb),
             attempts = n.attempts + 1, updated_at = now()
       where id = n.id;
    else
      update public.admin_notifications
         set request_id = public.telegram_send(n.text, n.opts), attempts = n.attempts + 1, updated_at = now()
       where id = n.id;
    end if;
  end loop;
  -- Limpieza: se guarda una semana
  delete from public.admin_notifications where created_at < now() - interval '7 days';
end;
$$;

-- ---------- Altas, propuestas y donaciones ----------
create or replace function public.notify_on_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n_total int;
  n_week int;
  v_book text;
  v_cat text;
  v_dups text;
  v_names text;
  v_amount text;
  v_msg text;
  v_type text;
begin
  if tg_table_name = 'profiles' then
    select count(*), count(*) filter (where created_at > now() - interval '7 days') into n_total, n_week from public.profiles;
    perform public.notify_admin(
      '👤 <b>Nuevo usuario</b>: ' || public.tg_esc(coalesce(new.display_name, 'sin nombre'))
      || E'\nUsuario nº ' || n_total || ' · ' || n_week || case when n_week = 1 then ' alta' else ' altas' end || ' en los últimos 7 días',
      jsonb_build_object('silent', true, 'buttons', public.tg_button('Ver usuarios', '#/admin/usuarios')));

  -- Condiciones anidadas: en PL/pgSQL «tabla = x and new.status = …» se evalúa entera y falla en tablas sin «status»
  -- (así fallaban las donaciones con la versión anterior).
  elsif tg_table_name = 'catalog' then
    if new.status <> 'pending' then return new; end if;
    select name into v_cat from public.categories where id = new.category_id;
    perform public.notify_admin(
      '📚 <b>Libro propuesto</b>' || E'\n'
      || coalesce('<b>' || public.tg_esc(new.code) || '</b> · ', '') || public.tg_esc(new.title)
      || coalesce(E'\nAutor: ' || public.tg_esc(nullif(new.author, '')), '')
      || coalesce(E'\nCategoría: ' || public.tg_esc(v_cat), '')
      || E'\nPor: ' || public.tg_who(new.created_by),
      jsonb_build_object('buttons', public.tg_button('Revisar', '#/revision')));

  elsif tg_table_name = 'catalog_barcodes' then
    if new.status <> 'pending' then return new; end if;
    select coalesce('<b>' || public.tg_esc(c.code) || '</b> · ', '') || public.tg_esc(c.title) into v_book
      from public.catalog c where c.id = new.catalog_id;
    select string_agg(coalesce(c.code || ' · ', '') || c.title
                      || case when b.status = 'pending' then ' (propuesto)' else '' end, '; ')
      into v_dups
      from public.catalog_barcodes b join public.catalog c on c.id = b.catalog_id
     where b.code = new.code and b.catalog_id <> new.catalog_id and b.status <> 'rejected';
    perform public.notify_admin(
      '🏷️ <b>Código propuesto</b>' || E'\n'
      || '<code>' || public.tg_esc(new.code) || '</code> → ' || coalesce(v_book, '?')
      || case when public.ean13_valid(new.code) then E'\n✓ EAN-13 válido'
              when new.code ~ '^[0-9]{13}$' then E'\n⚠️ Dígito de control incorrecto: ¿errata?'
              else E'\n⚠️ No es un EAN-13 (' || length(new.code) || ' caracteres)' end
      || coalesce(E'\n⚠️ Ese código ya está en: ' || public.tg_esc(v_dups), '')
      || E'\nPor: ' || public.tg_who(new.created_by),
      jsonb_build_object('buttons', public.tg_button('Revisar', '#/revision')));

  elsif tg_table_name = 'donations' then
    v_type := coalesce(new.type, '');
    v_amount := coalesce(to_char(new.amount, 'FM999990.00'), '?') || ' ' || coalesce(new.currency, '');
    select string_agg(public.tg_esc(coalesce(p.display_name, 'sin nombre')), ', ') into v_names
      from auth.users u join public.profiles p on p.id = u.id
     where lower(u.email) = any(new.emails);

    if v_type in ('donation.created', 'membership.started', 'recurring_donation.started', 'extra_purchase.created') then
      v_msg := '☕ <b>Donación</b>: ' || public.tg_esc(v_amount)
        || case
             when new.live_mode = false then E'\nEvento de prueba: no activa Mecenas.'
             when coalesce(new.amount, 0) < public.supporter_min_amount() then
               E'\nPor debajo del mínimo (' || public.supporter_min_amount() || '): no activa Mecenas.'
             when v_names is not null then E'\n✓ Mecenas para: ' || v_names
             else E'\n⚠️ Ninguna cuenta con ese email. Se activará sola si se registra con él; si no, asígnala a mano.'
           end;
    elsif v_type like '%refund%' then
      v_msg := '↩️ <b>Reembolso</b>: ' || public.tg_esc(v_amount) || coalesce(E'\nDe: ' || v_names, '')
        || E'\nMecenas no se retira automáticamente: decide en Admin → Usuarios.';
    elsif v_type like '%cancel%' then
      v_msg := '⏹ <b>Membresía cancelada</b>' || coalesce(E'\nDe: ' || v_names, '')
        || E'\nMecenas no se retira automáticamente.';
    else
      v_msg := '☕ Evento de Buy Me a Coffee: <code>' || public.tg_esc(v_type) || '</code> · ' || public.tg_esc(v_amount);
    end if;
    perform public.notify_admin(v_msg, jsonb_build_object('buttons', public.tg_button('Ver donaciones', '#/admin/donaciones')));
  end if;
  return new;
end;
$$;

-- ---------- Sugerencias: antes → después ----------
create or replace function public.notify_new_suggestion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_book text;
  v_diff text;
begin
  select to_jsonb(c), coalesce('<b>' || public.tg_esc(c.code) || '</b> · ', '') || public.tg_esc(c.title)
    into v_old, v_book from public.catalog c where c.id = new.catalog_id;
  select string_agg('• ' || public.tg_esc(public.tg_field_label(k)) || ': '
           || public.tg_esc(left(coalesce(v_old->>k, '(vacío)'), 80)) || ' → <b>'
           || public.tg_esc(left(coalesce(new.changes->>k, '(vacío)'), 80)) || '</b>', E'\n')
    into v_diff from jsonb_object_keys(new.changes) k;
  perform public.notify_admin(
    '✎ <b>Sugerencia de cambio</b> en ' || coalesce(v_book, '?')
    || E'\n' || coalesce(v_diff, '(sin cambios)')
    || coalesce(E'\nNota: «' || public.tg_esc(nullif(new.note, '')) || '»', '')
    || E'\nPor: ' || public.tg_who(new.created_by),
    jsonb_build_object('buttons', public.tg_button('Revisar', '#/revision')));
  return new;
end;
$$;

-- ---------- Comentarios: con versión y dispositivo ----------
create or replace function public.notify_new_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  device text;
begin
  select display_name into who from public.profiles where id = new.user_id;
  device := case when new.user_agent ~ 'iPhone|iPad' then 'iPhone/iPad' when new.user_agent ~ 'Android' then 'Android'
                 when new.user_agent ~ 'Mac' then 'Mac' when new.user_agent ~ 'Windows' then 'Windows' else 'otro' end;
  perform public.notify_admin(
    case new.kind when 'fallo' then '🐞 <b>Fallo</b>' when 'idea' then '💡 <b>Idea</b>' else '💬 <b>Comentario</b>' end
    || ' de ' || public.tg_esc(coalesce(who, 'un usuario'))
    || coalesce(' (' || public.tg_esc(new.page) || ')', '') || E':\n'
    || public.tg_esc(left(new.message, 1500))
    || E'\n<i>v' || public.tg_esc(coalesce(new.app_version, '?')) || ' · ' || device || '</i>',
    jsonb_build_object('buttons', public.tg_button('Ver comentarios', '#/admin/comentarios')));
  return new;
end;
$$;

-- ---------- Resumen semanal ----------
create or replace function public.weekly_admin_digest()
returns void language plpgsql security definer set search_path = public as $$
declare
  since timestamptz := now() - interval '7 days';
  u_total int; u_new int; u_active int;
  scans int; scans_unknown int; added int; searches int;
  p_books int; p_codes int; p_sugg int; p_fb int; oldest timestamptz;
  don text; failed int;
  pend text;
begin
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
    || case when failed > 0 then E'\n⚠️ Avisos de Telegram que no llegaron: ' || failed
                                 || E' (<code>select * from admin_notifications where status = ''failed''</code>)' else '' end,
    jsonb_build_object('buttons', public.tg_button('Abrir Admin', '#/admin')));
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'weekly-admin-digest') then
    perform cron.unschedule('weekly-admin-digest');
  end if;
  perform cron.schedule('weekly-admin-digest', '0 7 * * 1', 'select public.weekly_admin_digest()');   -- lunes 07:00 UTC
end;
$$;

-- ---------- Permisos: todo esto es interno ----------
revoke all on function public.tg_esc(text) from public, anon, authenticated;
revoke all on function public.app_url(text) from public, anon, authenticated;
revoke all on function public.tg_button(text, text) from public, anon, authenticated;
revoke all on function public.ean13_valid(text) from public, anon, authenticated;
revoke all on function public.tg_who(uuid) from public, anon, authenticated;
revoke all on function public.tg_field_label(text) from public, anon, authenticated;
revoke all on function public.telegram_send(text, jsonb) from public, anon, authenticated;
revoke all on function public.notify_admin(text, jsonb) from public, anon, authenticated;
revoke all on function public.retry_admin_notifications() from public, anon, authenticated;
revoke all on function public.notify_on_event() from public, anon, authenticated;
revoke all on function public.notify_new_suggestion() from public, anon, authenticated;
revoke all on function public.notify_new_feedback() from public, anon, authenticated;
revoke all on function public.weekly_admin_digest() from public, anon, authenticated;
