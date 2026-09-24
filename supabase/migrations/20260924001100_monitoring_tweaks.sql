-- =============================================================
-- Ajustes de la monitorización
--   1. Dos canales de Telegram: «gestión» (el chat de siempre: altas, propuestas, donaciones, resumen…) y
--      «monitorización» (errores de la app, fallos del webhook…). El segundo es opcional: secreto de Vault
--      telegram_monitor_chat_id; sin él, todo sigue llegando al chat de siempre.
--   2. client_errors: límites más estrictos (abajo).
-- =============================================================

-- ---------- 1. Canal de monitorización ----------
-- opts.channel = 'monitor' → chat de monitorización (si existe el secreto)
create or replace function public.telegram_send(p_text text, p_opts jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  v_token text;
  v_chat  text;
  v_body  jsonb;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'telegram_bot_token';
  if p_opts->>'channel' = 'monitor' then
    select decrypted_secret into v_chat from vault.decrypted_secrets where name = 'telegram_monitor_chat_id';
  end if;
  if v_chat is null then
    select decrypted_secret into v_chat from vault.decrypted_secrets where name = 'telegram_chat_id';
  end if;
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
revoke all on function public.telegram_send(text, jsonb) from public, anon, authenticated;

-- Errores de la app → canal de monitorización (misma función que en 20260924001000, con channel)
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
    '24 hours', '{"channel": "monitor"}'::jsonb);
  return new;
end;
$$;
revoke all on function public.notify_client_error() from public, anon, authenticated;

-- ---------- 2. client_errors: límites más estrictos para que ni un abuso de la clave pública ni un bucle de errores
-- puedan acercarse a los 500 MB del plan gratuito.
--   · Tope global: 60 errores por hora (antes 300). Por usuario: 20 por hora (antes 30).
--   · Se guardan 30 días (antes 90), con una limpieza diaria de pg_cron.
-- Peor caso: 60 × 24 × 30 ≈ 43.000 filas de ~3 KB como mucho ≈ 130 MB.
-- =============================================================

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
  if (select count(*) from public.client_errors where created_at > now() - interval '1 hour') >= 60 then
    return null;                                        -- tope global por hora
  end if;
  if new.user_id is not null and (select count(*) from public.client_errors
      where user_id = new.user_id and created_at > now() - interval '1 hour') >= 20 then
    return null;                                        -- tope por usuario y hora
  end if;
  return new;
end;
$$;
revoke all on function public.client_errors_before_insert() from public, anon, authenticated;

-- Limpieza diaria (el resumen semanal también borra, pero con el plazo antiguo de 90 días: esta va antes)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-client-errors') then
    perform cron.unschedule('purge-client-errors');
  end if;
  perform cron.schedule('purge-client-errors', '17 3 * * *',
    $cmd$delete from public.client_errors where created_at < now() - interval '30 days'$cmd$);
end;
$$;
