-- =============================================================
-- Lo que han pedido los usuarios (29/09/2026):
--   · catalog.no_barcode: el libro no lleva código de barras impreso (sale de la misión de códigos).
--   · catalog.not_playable: no es una aventura jugable (suplemento, bestiario…): sin nivel, jugadores ni sesiones.
--   · catalog.sessions_variable: duración variable (sandbox, campaña abierta) en lugar de un número de sesiones.
--   · Se pueden sugerir también la fecha de publicación, el formato y esos tres datos (y el admin los aplica).
--   · profiles.public_name: apodo público (Comunidad y lista de deseos compartida) distinto del nombre de Google.
-- =============================================================

alter table public.catalog
  add column if not exists no_barcode boolean not null default false,
  add column if not exists not_playable boolean not null default false,
  add column if not exists sessions_variable boolean not null default false;

alter table public.profiles
  add column if not exists public_name text
    check (public_name is null or (char_length(btrim(public_name)) between 2 and 30 and public_name = btrim(public_name)));
grant update (public_name) on public.profiles to authenticated;

create or replace function public.catalog_editable_fields()
returns text[] language sql immutable set search_path = public as $$
  select array['title','code','author','category_id','pages','cover_url','description',
               'min_level','max_level','min_players','max_players','sessions','tags','summary','out_of_print',
               'catalog_date','binding','no_barcode','not_playable','sessions_variable'];
$$;

-- Aplicar sugerencias y restaurar versiones incluyen los campos nuevos
create or replace function public.admin_apply_suggestion(p_id bigint, p_changes jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.catalog_suggestions;
  r public.catalog;
  allowed jsonb := '{}'::jsonb;
  k text;
  ch jsonb;
begin
  perform public.assert_admin();
  select * into s from public.catalog_suggestions where id = p_id for update;
  if s.id is null or s.status <> 'pending' then raise exception 'La sugerencia ya no está pendiente'; end if;
  ch := coalesce(p_changes, s.changes);
  for k in select jsonb_object_keys(ch) loop
    if k = any(public.catalog_editable_fields()) and k not in ('category_id', 'cover_url', 'description') then
      allowed := allowed || jsonb_build_object(k, ch -> k);
    end if;
  end loop;

  select * into r from public.catalog where id = s.catalog_id;
  r := jsonb_populate_record(r, allowed);
  if allowed ? 'code' then
    r.series := nullif(substring(r.code from '^[A-Za-z]+'), '');
    r.number := nullif(substring(r.code from '[0-9]+$'), '')::int;
  end if;
  update public.catalog set
    title = r.title, code = r.code, series = r.series, number = r.number, author = r.author, pages = r.pages,
    min_level = r.min_level, max_level = r.max_level, min_players = r.min_players, max_players = r.max_players,
    sessions = r.sessions, tags = r.tags, summary = r.summary, out_of_print = r.out_of_print,
    catalog_date = r.catalog_date, binding = r.binding, no_barcode = r.no_barcode, not_playable = r.not_playable,
    sessions_variable = r.sessions_variable
  where id = r.id;

  update public.catalog_suggestions
     set status = 'approved', changes = allowed, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;
end;
$$;

create or replace function public.admin_restore_version(p_history bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  h public.catalog_history;
  r public.catalog;
  b public.catalog_barcodes;
begin
  perform public.assert_admin();
  select * into h from public.catalog_history where id = p_history;
  if h.id is null then raise exception 'Versión no encontrada'; end if;
  perform set_config('escriba.restoring', 'on', true);

  if h.table_name = 'catalog' then
    if h.old_data is null then
      -- Era un alta: restaurar el estado anterior = borrar el libro
      delete from public.catalog where id = h.catalog_id;
    else
      r := jsonb_populate_record(null::public.catalog, h.old_data);
      if exists (select 1 from public.catalog where id = r.id) then
        update public.catalog set
          title = r.title, code = r.code, series = r.series, number = r.number, author = r.author, kind = r.kind,
          category_id = r.category_id, pages = r.pages, binding = r.binding, interior = r.interior,
          price_eur = r.price_eur, catalog_date = r.catalog_date, isbn_published = r.isbn_published,
          cover_url = r.cover_url, description = r.description, status = r.status,
          min_level = r.min_level, max_level = r.max_level, min_players = r.min_players, max_players = r.max_players,
          sessions = r.sessions, tags = r.tags, summary = r.summary, codex_url = r.codex_url,
          out_of_print = r.out_of_print, no_barcode = r.no_barcode, not_playable = r.not_playable,
          sessions_variable = r.sessions_variable
        where id = r.id;
      else
        insert into public.catalog select r.*;   -- el libro se había borrado: se recrea (sin las bibliotecas que lo tenían)
      end if;
    end if;
  else
    if h.old_data is null then
      delete from public.catalog_barcodes
       where code = h.new_data ->> 'code' and catalog_id = (h.new_data ->> 'catalog_id')::uuid;
    else
      b := jsonb_populate_record(null::public.catalog_barcodes, h.old_data);
      insert into public.catalog_barcodes select b.*
      on conflict (code, catalog_id) do update
        set status = excluded.status, verified = excluded.verified, source = excluded.source;
    end if;
  end if;
  perform set_config('escriba.restoring', 'off', true);
end;
$$;

-- Nombre que se enseña en público: el apodo si lo hay; si no, el de Google abreviado («Ana G.»)
create or replace function public.public_display_name(p public.profiles)
returns text language sql stable set search_path = public as $$
  select coalesce(nullif(p.public_name, ''), public.short_name(p.display_name));
$$;

create or replace function public.scribes()
returns table (name text, suggestions int, codes int, books int, total int, is_me boolean,
               emblem text, xp int, level int, supporter boolean)
language sql stable security definer set search_path = public as $$
  with c as (
    select
      p.id, public.public_display_name(p) as shown, p.emblem,
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
  select shown, suggestions, codes, books, suggestions + codes + books,
         id = (select auth.uid()), emblem, xp, public.xp_level(xp), supporter
  from c
  where suggestions + codes + books > 0
  order by suggestions + codes + books desc, xp desc, 1
  limit 100;
$$;

create or replace function public.supporters()
returns table (name text, emblem text, since date, level int, is_me boolean)
language sql stable security definer set search_path = public as $$
  select public.public_display_name(p), p.emblem, p.supporter_since::date, public.xp_level(public.user_xp(p.id)),
         p.id = (select auth.uid())
  from public.profiles p
  where p.is_supporter and p.show_in_supporters
  order by p.supporter_since nulls last, 1
  limit 200;
$$;

-- Lista de deseos compartida: el apodo si lo hay (antes, el nombre de Google completo)
create or replace function public.public_wishlist(p_token uuid)
returns table (owner_name text, code text, title text, category text, out_of_print boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.public_name, ''), p.display_name), c.code, c.title, cat.name, c.out_of_print
  from public.profiles p
  join public.wishlist w on w.user_id = p.id
  join public.catalog c on c.id = w.catalog_id
  left join public.categories cat on cat.id = c.category_id
  where p.share_token = p_token and p_token is not null
    and not exists (select 1 from public.library l where l.user_id = p.id and l.catalog_id = c.id)
  order by cat.sort_order, c.series, c.number, c.title;
$$;

revoke all on function public.public_display_name(public.profiles) from public, anon, authenticated;
