-- =============================================================
-- Avisos por Telegram más fiables
--   · Timeout de 15 s (antes 5 s por defecto): un aviso de alta se perdió por un
--     «Timeout of 5000 ms reached» en la conexión con api.telegram.org.
--   · Registro de avisos (admin_notifications) y reintento automático cada 5 minutos con pg_cron
--     de los que no recibieron un 200 (hasta 3 intentos).
-- =============================================================

create table if not exists public.admin_notifications (
  id          bigserial primary key,
  text        text not null,
  request_id  bigint,                 -- id de la petición en pg_net (net._http_response)
  attempts    int not null default 1,
  status      text not null default 'sent' check (status in ('sent', 'ok', 'failed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists admin_notifications_pending_idx on public.admin_notifications (status, created_at);
alter table public.admin_notifications enable row level security;   -- sin políticas: solo service role / funciones
grant all on public.admin_notifications to service_role;

-- Envía la petición a Telegram y devuelve el id de pg_net (null si no hay secretos)
create or replace function public.telegram_send(p_text text)
returns bigint language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  v_token text;
  v_chat  text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'telegram_bot_token';
  select decrypted_secret into v_chat  from vault.decrypted_secrets where name = 'telegram_chat_id';
  if v_token is null or v_chat is null then
    return null;
  end if;
  return net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := jsonb_build_object('chat_id', v_chat, 'text', left(p_text, 3500), 'disable_web_page_preview', true),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 15000
  );
end;
$$;
revoke all on function public.telegram_send(text) from public, anon, authenticated;

-- Misma firma que antes: la usan los triggers de altas, propuestas, sugerencias y donaciones
create or replace function public.notify_admin(p_text text)
returns void language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  rid bigint;
begin
  rid := public.telegram_send(p_text);
  if rid is not null then
    insert into public.admin_notifications (text, request_id) values (p_text, rid);
  end if;
exception when others then
  raise warning 'notify_admin: %', sqlerrm;
end;
$$;
revoke all on function public.notify_admin(text) from public, anon, authenticated;

-- Revisa las respuestas de Telegram y reintenta las fallidas (máx. 3 intentos)
create or replace function public.retry_admin_notifications()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  n record;
  resp record;
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
    else
      update public.admin_notifications
         set request_id = public.telegram_send(n.text), attempts = n.attempts + 1, updated_at = now()
       where id = n.id;
    end if;
  end loop;
  -- Limpieza: se guarda una semana
  delete from public.admin_notifications where created_at < now() - interval '7 days';
end;
$$;
revoke all on function public.retry_admin_notifications() from public, anon, authenticated;

-- Programar el reintento cada 5 minutos (pg_cron está disponible en Supabase)
create extension if not exists pg_cron;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'retry-admin-notifications') then
    perform cron.unschedule('retry-admin-notifications');
  end if;
  perform cron.schedule('retry-admin-notifications', '*/5 * * * *', 'select public.retry_admin_notifications()');
end;
$$;
