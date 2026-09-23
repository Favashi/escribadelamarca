-- =============================================================
-- Escriba de la Marca — esquema inicial
-- Migración aplicada por la integración GitHub de Supabase (o `supabase db push`).
-- No editar tras aplicarla: los cambios van en migraciones nuevas.
-- =============================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------
-- Tablas
-- -------------------------------------------------------------

create table if not exists public.categories (
  id          serial primary key,
  slug        text unique not null,
  name        text not null,
  sort_order  int  not null default 0
);

create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text,
  display_name     text,
  avatar_url       text,
  is_supporter     boolean not null default false,
  supporter_since  timestamptz,
  is_admin         boolean not null default false,
  created_at       timestamptz not null default now()
);

create table if not exists public.catalog (
  id           uuid primary key default gen_random_uuid(),
  isbn         text unique,                         -- EAN-13 normalizado (solo dígitos)
  title        text not null,
  category_id  int references public.categories(id) on delete set null,
  cover_url    text,
  year         int,
  pages        int,
  description  text,
  status       text not null default 'approved' check (status in ('approved','pending')),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint isbn_digits check (isbn is null or isbn ~ '^[0-9]{8,13}$')
);

create table if not exists public.library (
  user_id     uuid not null references auth.users(id) on delete cascade,
  catalog_id  uuid not null references public.catalog(id) on delete cascade,
  added_at    timestamptz not null default now(),
  condition   text,
  notes       text,
  primary key (user_id, catalog_id)
);

-- Extras Mecenas
create table if not exists public.wishlist (
  user_id     uuid not null references auth.users(id) on delete cascade,
  catalog_id  uuid not null references public.catalog(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (user_id, catalog_id)
);

create table if not exists public.loans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  catalog_id   uuid not null references public.catalog(id) on delete cascade,
  lent_to      text not null,
  lent_at      timestamptz not null default now(),
  returned_at  timestamptz
);

-- Registro de pagos Ko-fi (solo accesible con service role)
create table if not exists public.kofi_payments (
  id           bigserial primary key,
  kofi_tx_id   text unique,
  type         text,
  email        text,
  emails       text[] not null default '{}',   -- emails candidatos (pago + mensaje), en minúsculas
  amount       numeric,
  currency     text,
  matched      boolean not null default false,
  raw          jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists library_user_idx  on public.library(user_id);
create index if not exists catalog_cat_idx   on public.catalog(category_id);
create index if not exists loans_user_idx    on public.loans(user_id);

-- -------------------------------------------------------------
-- Funciones auxiliares
-- -------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_supporter()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_supporter from public.profiles where id = auth.uid()), false);
$$;

-- Umbral para ser Mecenas (en la moneda del pago)
create or replace function public.supporter_min_amount()
returns numeric language sql immutable as $$ select 3::numeric $$;

-- Crea perfil al registrarse. Si ya existía una donación Ko-fi con su email, lo marca Mecenas.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  paid boolean;
begin
  select exists (
    select 1 from public.kofi_payments
    where lower(new.email) = any(emails) and amount >= public.supporter_min_amount()
  ) into paid;

  insert into public.profiles (id, email, display_name, avatar_url, is_supporter, supporter_since)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    paid,
    case when paid then now() end
  )
  on conflict (id) do nothing;

  if paid then
    update public.kofi_payments set matched = true where lower(new.email) = any(emails);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Llamada por la Edge Function kofi-webhook (service role). Devuelve true si encontró usuario.
create or replace function public.mark_supporter_by_email(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update public.profiles p
     set is_supporter = true,
         supporter_since = coalesce(p.supporter_since, now())
    from auth.users u
   where u.id = p.id and lower(u.email) = lower(p_email);
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.mark_supporter_by_email(text) from public, anon, authenticated;
grant execute on function public.mark_supporter_by_email(text) to service_role;

-- Normaliza ISBN: solo dígitos, cadena vacía -> null
create or replace function public.catalog_normalize()
returns trigger language plpgsql as $$
begin
  if new.isbn is not null then
    new.isbn := nullif(regexp_replace(new.isbn, '[^0-9]', '', 'g'), '');
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_normalize on public.catalog;
create trigger catalog_normalize
  before insert or update on public.catalog
  for each row execute function public.catalog_normalize();

-- -------------------------------------------------------------
-- Permisos explícitos (el proyecto no expone tablas nuevas automáticamente).
-- Qué filas ve cada usuario lo decide RLS, más abajo.
-- -------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant select                         on public.categories to anon, authenticated;
grant insert, update, delete         on public.categories to authenticated;   -- RLS: solo admin
grant select                         on public.profiles   to authenticated;
grant select, insert, update, delete on public.catalog    to authenticated;
grant select, insert, update, delete on public.library    to authenticated;
grant select, insert, update, delete on public.wishlist   to authenticated;
grant select, insert, update, delete on public.loans      to authenticated;
grant usage on sequence public.categories_id_seq to authenticated;

-- service_role (Edge Functions): salta RLS, pero necesita privilegios de tabla
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant execute on function public.is_admin()             to authenticated;
grant execute on function public.is_supporter()         to authenticated;
grant execute on function public.supporter_min_amount() to authenticated;

-- -------------------------------------------------------------
-- Row Level Security
-- -------------------------------------------------------------

alter table public.categories    enable row level security;
alter table public.profiles      enable row level security;
alter table public.catalog       enable row level security;
alter table public.library       enable row level security;
alter table public.wishlist      enable row level security;
alter table public.loans         enable row level security;
alter table public.kofi_payments enable row level security;   -- sin políticas: solo service role

-- categories: lectura pública, escritura admin
drop policy if exists categories_read  on public.categories;
drop policy if exists categories_admin on public.categories;
create policy categories_read  on public.categories for select using (true);
create policy categories_admin on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles: cada uno el suyo (admin ve todos)
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- El usuario solo puede cambiar nombre y avatar (nunca is_supporter / is_admin)
revoke update on public.profiles from authenticated, anon;
grant  update (display_name, avatar_url) on public.profiles to authenticated;

-- catalog
drop policy if exists catalog_select        on public.catalog;
drop policy if exists catalog_insert        on public.catalog;
drop policy if exists catalog_update_admin  on public.catalog;
drop policy if exists catalog_delete        on public.catalog;
create policy catalog_select on public.catalog for select to authenticated
  using (status = 'approved' or created_by = auth.uid() or public.is_admin());
create policy catalog_insert on public.catalog for insert to authenticated
  with check (
    public.is_admin()
    or (status = 'pending' and created_by = auth.uid())
  );
create policy catalog_update_admin on public.catalog for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy catalog_delete on public.catalog for delete to authenticated
  using (public.is_admin() or (status = 'pending' and created_by = auth.uid()));

-- library: solo lo propio
drop policy if exists library_own on public.library;
create policy library_own on public.library for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- wishlist / loans: solo lo propio y solo Mecenas (control en servidor, no solo en la UI)
drop policy if exists wishlist_own on public.wishlist;
create policy wishlist_own on public.wishlist for all to authenticated
  using (user_id = auth.uid() and public.is_supporter())
  with check (user_id = auth.uid() and public.is_supporter());

drop policy if exists loans_own on public.loans;
create policy loans_own on public.loans for all to authenticated
  using (user_id = auth.uid() and public.is_supporter())
  with check (user_id = auth.uid() and public.is_supporter());

-- -------------------------------------------------------------
-- Datos iniciales
-- -------------------------------------------------------------

insert into public.categories (slug, name, sort_order) values
  ('reglamento',   'Reglamento básico',       10),
  ('aventuras',    'Aventuras y módulos',     20),
  ('suplementos',  'Suplementos',             30),
  ('bestiarios',   'Bestiarios',              40),
  ('ambientacion', 'Ambientación y mapas',    50),
  ('novelas',      'Novelas y relatos',       60),
  ('otros',        'Otros',                   90)
on conflict (slug) do nothing;

-- Catálogo inicial: ver migración 20260923000100_seed_catalog.sql.
