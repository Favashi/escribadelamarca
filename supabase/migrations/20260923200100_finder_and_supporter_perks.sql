-- =============================================================
-- v1.1.0: buscador de aventuras + extras de Mecenas
--   · Datos de juego en el catálogo (niveles, personajes, sesiones, etiquetas, resumen) desde Codex LMDE
--   · Diario de partidas (plays)
--   · Repetidos (library.spares) e intercambio entre Mecenas (opt-in)
--   · Lista de deseos compartible por enlace público (share_token)
-- =============================================================

-- ---------- Datos de juego ----------
alter table public.catalog
  add column if not exists min_level   int,
  add column if not exists max_level   int,
  add column if not exists min_players int,
  add column if not exists max_players int,
  add column if not exists sessions    int,
  add column if not exists tags        text[] not null default '{}',
  add column if not exists summary     text,
  add column if not exists codex_url   text;

create index if not exists catalog_levels_idx on public.catalog (min_level, max_level);
create index if not exists catalog_tags_idx   on public.catalog using gin (tags);

-- ---------- Diario de partidas (Mecenas) ----------
create table if not exists public.plays (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  catalog_id  uuid not null references public.catalog(id) on delete cascade,
  role        text not null default 'dirigido' check (role in ('dirigido', 'jugado')),
  played_on   date not null default current_date,
  group_name  text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists plays_user_idx on public.plays(user_id, catalog_id);

grant select, insert, update, delete on public.plays to authenticated;
grant all on public.plays to service_role;
alter table public.plays enable row level security;
drop policy if exists plays_own on public.plays;
create policy plays_own on public.plays for all to authenticated
  using (user_id = auth.uid() and public.is_supporter())
  with check (user_id = auth.uid() and public.is_supporter());

-- ---------- Repetidos ----------
alter table public.library add column if not exists spares int not null default 0 check (spares between 0 and 99);

-- ---------- Opciones de perfil: compartir deseos e intercambio ----------
alter table public.profiles
  add column if not exists share_token     uuid unique,   -- null = lista de deseos no compartida
  add column if not exists trade_opt_in    boolean not null default false,
  add column if not exists trade_contact   text check (char_length(trade_contact) <= 120);

-- El usuario puede cambiar estas columnas (no is_supporter / is_admin)
grant update (share_token, trade_opt_in, trade_contact) on public.profiles to authenticated;

-- Lista de deseos pública: cualquiera con el enlace la ve (sin sesión). Solo expone nombre y libros.
create or replace function public.public_wishlist(p_token uuid)
returns table (owner_name text, code text, title text, category text)
language sql stable security definer set search_path = public as $$
  select p.display_name, c.code, c.title, cat.name
  from public.profiles p
  join public.wishlist w on w.user_id = p.id
  join public.catalog c on c.id = w.catalog_id
  left join public.categories cat on cat.id = c.category_id
  where p.share_token = p_token and p_token is not null
    and not exists (select 1 from public.library l where l.user_id = p.id and l.catalog_id = c.id)
  order by cat.sort_order, c.series, c.number, c.title;
$$;
revoke all on function public.public_wishlist(uuid) from public;
grant execute on function public.public_wishlist(uuid) to anon, authenticated;

-- Intercambio: Mecenas con repetidos de libros que están en mi lista de deseos.
-- Solo para Mecenas y solo entre usuarios que han activado el intercambio.
create or replace function public.trade_matches()
returns table (catalog_id uuid, code text, title text, owner_name text, contact text, spares int)
language sql stable security definer set search_path = public as $$
  select c.id, c.code, c.title, p.display_name, p.trade_contact, l.spares
  from public.wishlist w
  join public.catalog c on c.id = w.catalog_id
  join public.library l on l.catalog_id = w.catalog_id and l.spares > 0 and l.user_id <> auth.uid()
  join public.profiles p on p.id = l.user_id and p.trade_opt_in and p.is_supporter
  where w.user_id = auth.uid()
    and public.is_supporter()
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.trade_opt_in)
  order by c.series, c.number, p.display_name;
$$;
revoke all on function public.trade_matches() from public;
grant execute on function public.trade_matches() to authenticated;
