-- =============================================================
-- Historial de cambios del catálogo (tipo wiki) y sugerencias de los usuarios
--   · catalog_history: cada alta/edición/borrado de libros y códigos guarda la versión anterior y la nueva.
--     Solo lo ve el admin, que puede restaurar cualquier versión.
--   · catalog_suggestions: los usuarios proponen cambios en los datos de un libro; el admin los valida o rechaza.
--   · catalog.locked_fields: campos editados desde la app (admin o sugerencia validada). catalog_sync.py
--     no los sobrescribe con el CSV.
-- =============================================================

-- ---------- Campos protegidos frente a la sincronización con el CSV ----------
alter table public.catalog add column if not exists locked_fields text[] not null default '{}';

-- Campos del catálogo que se editan desde la app (y que se pueden sugerir, salvo los marcados abajo)
create or replace function public.catalog_editable_fields()
returns text[] language sql immutable set search_path = public as $$
  select array['title','code','author','category_id','pages','cover_url','description',
               'min_level','max_level','min_players','max_players','sessions','tags','summary'];
$$;

-- Al editar un libro desde la app (hay usuario), los campos cambiados quedan protegidos
create or replace function public.catalog_lock_edited_fields()
returns trigger language plpgsql set search_path = public as $$
declare
  f text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if auth.uid() is null then
    return new;   -- migraciones / sincronización con el CSV: no protegen nada
  end if;
  foreach f in array public.catalog_editable_fields() loop
    if (o -> f) is distinct from (n -> f) and not (f = any(new.locked_fields)) then
      new.locked_fields := array_append(new.locked_fields, f);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists catalog_lock_edited_fields on public.catalog;
create trigger catalog_lock_edited_fields
  before update on public.catalog
  for each row execute function public.catalog_lock_edited_fields();

-- ---------- Historial ----------
create table if not exists public.catalog_history (
  id          bigserial primary key,
  table_name  text not null check (table_name in ('catalog', 'catalog_barcodes')),
  catalog_id  uuid not null,                 -- sin FK: el historial sobrevive al borrado del libro
  op          text not null check (op in ('insert', 'update', 'delete', 'restore')),
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid,                          -- null = migración o sincronización con el CSV
  created_at  timestamptz not null default now()
);
create index if not exists catalog_history_book_idx on public.catalog_history (catalog_id, created_at desc);

grant select on public.catalog_history to authenticated;
grant all on public.catalog_history to service_role;
alter table public.catalog_history enable row level security;
drop policy if exists catalog_history_admin on public.catalog_history;
create policy catalog_history_admin on public.catalog_history for select to authenticated
  using ((select public.is_admin()));

create or replace function public.record_catalog_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  book uuid := coalesce((n ->> 'catalog_id')::uuid, (o ->> 'catalog_id')::uuid, (n ->> 'id')::uuid, (o ->> 'id')::uuid);
begin
  -- Ignorar actualizaciones sin cambios reales (p. ej. una sincronización que no cambia nada)
  if tg_op = 'UPDATE' and (o - 'locked_fields') = (n - 'locked_fields') then
    return new;
  end if;
  insert into public.catalog_history (table_name, catalog_id, op, old_data, new_data, changed_by)
  values (tg_table_name, book,
          case when current_setting('escriba.restoring', true) = 'on' then 'restore' else lower(tg_op) end,
          o, n, auth.uid());
  return coalesce(new, old);
end;
$$;
revoke execute on function public.record_catalog_history() from public, anon, authenticated;

drop trigger if exists catalog_history on public.catalog;
create trigger catalog_history after insert or update or delete on public.catalog
  for each row execute function public.record_catalog_history();
drop trigger if exists barcodes_history on public.catalog_barcodes;
create trigger barcodes_history after insert or update or delete on public.catalog_barcodes
  for each row execute function public.record_catalog_history();

-- Restaurar una versión (la «antigua» de esa entrada del historial). El propio cambio queda en el historial.
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
          sessions = r.sessions, tags = r.tags, summary = r.summary, codex_url = r.codex_url
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
revoke all on function public.admin_restore_version(bigint) from public, anon;
grant execute on function public.admin_restore_version(bigint) to authenticated;

-- ---------- Sugerencias de cambios ----------
create table if not exists public.catalog_suggestions (
  id           bigserial primary key,
  catalog_id   uuid not null references public.catalog(id) on delete cascade,
  changes      jsonb not null check (jsonb_typeof(changes) = 'object' and pg_column_size(changes) < 8000),
  note         text check (char_length(note) <= 500),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  reviewed_by  uuid references auth.users(id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text check (char_length(review_note) <= 500)
);
create index if not exists suggestions_status_idx on public.catalog_suggestions (status, created_at desc);
create index if not exists suggestions_book_idx on public.catalog_suggestions (catalog_id);
create index if not exists suggestions_user_idx on public.catalog_suggestions (created_by);

grant select, insert, delete on public.catalog_suggestions to authenticated;
grant usage on sequence public.catalog_suggestions_id_seq to authenticated;
grant all on public.catalog_suggestions to service_role;
alter table public.catalog_suggestions enable row level security;

drop policy if exists suggestions_select on public.catalog_suggestions;
create policy suggestions_select on public.catalog_suggestions for select to authenticated
  using (created_by = (select auth.uid()) or (select public.is_admin()));
drop policy if exists suggestions_insert on public.catalog_suggestions;
create policy suggestions_insert on public.catalog_suggestions for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'pending' and reviewed_by is null);
drop policy if exists suggestions_delete on public.catalog_suggestions;
create policy suggestions_delete on public.catalog_suggestions for delete to authenticated
  using ((created_by = (select auth.uid()) and status = 'pending') or (select public.is_admin()));

-- Validar: aplica los cambios (opcionalmente corregidos por el admin) solo sobre los campos permitidos
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
    sessions = r.sessions, tags = r.tags, summary = r.summary
  where id = r.id;

  update public.catalog_suggestions
     set status = 'approved', changes = allowed, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;
end;
$$;

create or replace function public.admin_reject_suggestion(p_id bigint, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update public.catalog_suggestions
     set status = 'rejected', review_note = left(p_note, 500), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id and status = 'pending';
end;
$$;

revoke all on function public.admin_apply_suggestion(bigint, jsonb) from public, anon;
revoke all on function public.admin_reject_suggestion(bigint, text) from public, anon;
grant execute on function public.admin_apply_suggestion(bigint, jsonb) to authenticated;
grant execute on function public.admin_reject_suggestion(bigint, text) to authenticated;
revoke execute on function public.catalog_lock_edited_fields() from public, anon, authenticated;

-- ---------- Aviso por Telegram de sugerencias nuevas ----------
create or replace function public.notify_new_suggestion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  book text;
begin
  select display_name into who from public.profiles where id = new.created_by;
  select coalesce(code || ' · ', '') || title into book from public.catalog where id = new.catalog_id;
  perform public.notify_admin('✎ Sugerencia de cambio en ' || coalesce(book, '?')
    || E'\nCampos: ' || (select string_agg(k, ', ') from jsonb_object_keys(new.changes) k)
    || E'\nPor: ' || coalesce(who, 'desconocido') || E'\nRevísala en Admin → Revisión.');
  return new;
end;
$$;
revoke execute on function public.notify_new_suggestion() from public, anon, authenticated;

drop trigger if exists notify_new_suggestion on public.catalog_suggestions;
create trigger notify_new_suggestion after insert on public.catalog_suggestions
  for each row execute function public.notify_new_suggestion();
