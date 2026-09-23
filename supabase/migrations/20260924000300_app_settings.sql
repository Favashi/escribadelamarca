-- =============================================================
-- Ajustes de la app (feature flags) que el admin cambia desde Admin → Ajustes, sin publicar versión.
-- Lectura pública (la portada sin sesión también los necesita); escritura solo admin.
-- =============================================================

create table if not exists public.app_settings (
  key         text primary key check (key ~ '^[a-z_]{2,40}$'),
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

insert into public.app_settings (key, value) values
  ('covers_enabled',      'true'::jsonb),
  ('suggestions_enabled', 'true'::jsonb),
  ('donations_enabled',   'true'::jsonb),
  ('announcement',        '{"enabled": false, "text": "", "level": "info"}'::jsonb)
on conflict (key) do nothing;

grant select on public.app_settings to anon, authenticated;
grant insert, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select using (true);
drop policy if exists app_settings_admin_insert on public.app_settings;
create policy app_settings_admin_insert on public.app_settings for insert to authenticated
  with check ((select public.is_admin()));
drop policy if exists app_settings_admin_update on public.app_settings;
create policy app_settings_admin_update on public.app_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.app_settings_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke execute on function public.app_settings_touch() from public, anon, authenticated;
drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch before insert or update on public.app_settings
  for each row execute function public.app_settings_touch();

-- Interruptor booleano (true si no existe)
create or replace function public.setting_enabled(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'true'::jsonb from public.app_settings where key = p_key), true);
$$;
revoke all on function public.setting_enabled(text) from public, anon;
grant execute on function public.setting_enabled(text) to authenticated;

-- Pausar sugerencias también en la base de datos (no solo ocultar el botón)
drop policy if exists suggestions_insert on public.catalog_suggestions;
create policy suggestions_insert on public.catalog_suggestions for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'pending' and reviewed_by is null
              and (select public.setting_enabled('suggestions_enabled')));
