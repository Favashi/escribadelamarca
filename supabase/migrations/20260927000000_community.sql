-- =============================================================
-- Comunidad: nivel de escriba, emblemas y lista de Mecenas
--   · profiles.emblem: emblema elegido (clave de js/emblems.js; null = el de por defecto).
--   · profiles.show_in_supporters: aparecer en la lista de Mecenas (voluntario, desactivado por defecto).
--   · user_xp(): PX de un usuario, con la misma fórmula que xpBreakdown() en js/achievements.js:
--       100 por aportación aceptada + 25 por logro (sin los de rango) + 10 por libro jugado y 10 por dirigido.
--   · scribes(): añade emblema, PX, nivel y si es Mecenas (solo si también lo muestra).
--   · supporters(): Mecenas que lo han activado, nombre abreviado y emblema; sin cantidades, por antigüedad.
--   · community_counts(): cuántos escribas y mecenas hay (solo números; también sin sesión, para la portada).
-- =============================================================

alter table public.profiles
  add column if not exists emblem text check (emblem ~ '^[a-z0-9-]{1,40}$'),
  add column if not exists show_in_supporters boolean not null default false;

grant update (emblem, show_in_supporters) on public.profiles to authenticated;

-- «Ana García López» → «Ana G.»
create or replace function public.short_name(full_name text)
returns text language sql immutable set search_path = public as $$
  select coalesce(
    split_part(nullif(trim(full_name), ''), ' ', 1)
      || coalesce(' ' || nullif(left(split_part(trim(full_name), ' ', 2), 1), '') || '.', ''),
    'Escriba anónimo');
$$;

create or replace function public.user_contributions(uid uuid)
returns int language sql stable security definer set search_path = public as $$
  select ((select count(*) from public.catalog_suggestions s where s.created_by = uid and s.status = 'approved')
        + (select count(*) from public.catalog_barcodes b where b.created_by = uid and b.status = 'approved' and b.source = 'usuario')
        + (select count(*) from public.catalog k where k.created_by = uid and k.status = 'approved' and k.source = 'app'))::int;
$$;

create or replace function public.user_xp(uid uuid)
returns int language sql stable security definer set search_path = public as $$
  select (100 * public.user_contributions(uid)
        + 25 * (select count(*) from public.user_achievements a where a.user_id = uid and a.key not like 'rank:%')
        + 10 * (select count(*) from public.book_marks m where m.user_id = uid and m.played_at is not null)
        + 10 * (select count(*) from public.book_marks m where m.user_id = uid and m.directed_at is not null))::int;
$$;

-- Nivel a partir de los PX: 0, 100, 300, 600, 1000… PX para los niveles 1, 2, 3, 4, 5… (levelOf() en el cliente)
create or replace function public.xp_level(xp int)
returns int language sql immutable set search_path = public as $$
  select greatest(1, floor((1 + sqrt(1 + greatest(xp, 0) / 12.5)) / 2))::int;
$$;

revoke all on function public.user_contributions(uuid) from public, anon, authenticated;
revoke all on function public.user_xp(uuid) from public, anon, authenticated;

-- Cambia el tipo de retorno: hay que borrarla antes
drop function if exists public.scribes();
create function public.scribes()
returns table (name text, suggestions int, codes int, books int, total int, is_me boolean,
               emblem text, xp int, level int, supporter boolean)
language sql stable security definer set search_path = public as $$
  with c as (
    select
      p.id, p.display_name, p.emblem,
      (p.is_supporter and p.show_in_supporters) as supporter,
      (select count(*) from public.catalog_suggestions s
        where s.created_by = p.id and s.status = 'approved')::int as suggestions,
      (select count(*) from public.catalog_barcodes b
        where b.created_by = p.id and b.status = 'approved' and b.source = 'usuario')::int as codes,
      (select count(*) from public.catalog k
        where k.created_by = p.id and k.status = 'approved' and k.source = 'app')::int as books,
      public.user_xp(p.id) as xp
    from public.profiles p
    where p.show_in_scribes
  )
  select public.short_name(display_name), suggestions, codes, books, suggestions + codes + books,
         id = (select auth.uid()), emblem, xp, public.xp_level(xp), supporter
  from c
  where suggestions + codes + books > 0
  order by suggestions + codes + books desc, xp desc, 1
  limit 100;
$$;
revoke all on function public.scribes() from public, anon;
grant execute on function public.scribes() to authenticated;

create or replace function public.supporters()
returns table (name text, emblem text, since date, level int, is_me boolean)
language sql stable security definer set search_path = public as $$
  select public.short_name(p.display_name), p.emblem, p.supporter_since::date, public.xp_level(public.user_xp(p.id)),
         p.id = (select auth.uid())
  from public.profiles p
  where p.is_supporter and p.show_in_supporters
  order by p.supporter_since nulls last, 1
  limit 200;
$$;
revoke all on function public.supporters() from public, anon;
grant execute on function public.supporters() to authenticated;

-- Solo recuentos (sin nombres): quién ha aportado al catálogo y cuántos Mecenas hay
create or replace function public.community_counts()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'scribes', (select count(*) from public.profiles p where public.user_contributions(p.id) > 0),
    'supporters', (select count(*) from public.profiles p where p.is_supporter));
$$;
revoke all on function public.community_counts() from public;
grant execute on function public.community_counts() to anon, authenticated;
