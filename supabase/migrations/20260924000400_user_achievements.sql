-- =============================================================
-- Logros de los usuarios (gamificación ligera)
--   · Se calculan en la app a partir de la biblioteca y las aportaciones, y aquí se guardan los ya conseguidos,
--     para que sean permanentes (no se pierden al cambiar de dispositivo ni si una serie crece después).
--   · key: 'first_book', 'books:25', 'explorer', 'series:B', 'rank:3'…
--   · level: veces conseguido (p. ej. volver a completar una serie que ha crecido).
--   · meta: contexto del logro (nº de módulos al completarla, historial de veces…).
-- =============================================================

create table if not exists public.user_achievements (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key         text not null check (key ~ '^[a-z_]+(:[A-Za-z0-9_]+)?$' and char_length(key) <= 40),
  level       int not null default 1 check (level between 1 and 999),
  earned_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  meta        jsonb not null default '{}'::jsonb check (pg_column_size(meta) < 4000),
  primary key (user_id, key)
);

grant select, insert, update on public.user_achievements to authenticated;
grant all on public.user_achievements to service_role;
alter table public.user_achievements enable row level security;

drop policy if exists achievements_own on public.user_achievements;
create policy achievements_own on public.user_achievements for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
