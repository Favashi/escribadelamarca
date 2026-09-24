-- =============================================================
-- Marcas rápidas por libro (sugerencia de un usuario): Leída, Jugada y Dirigida.
--   · Para todos (no solo Mecenas) y para cualquier libro, lo tengas o no (se puede jugar en la mesa de un amigo o
--     leer un módulo prestado). No cuentan como «tenerlo» ni para series ni para logros.
--   · Se guardan como fechas (cuándo se marcó); null = sin marcar.
--   · El diario de partidas de Mecenas (plays) marca solo Jugada o Dirigida al apuntar una partida.
-- =============================================================

create table if not exists public.book_marks (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  catalog_id   uuid not null references public.catalog(id) on delete cascade,
  read_at      timestamptz,
  played_at    timestamptz,
  directed_at  timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, catalog_id)
);
create index if not exists book_marks_catalog_idx on public.book_marks (catalog_id);

grant select, insert, update, delete on public.book_marks to authenticated;
grant all on public.book_marks to service_role;
alter table public.book_marks enable row level security;
drop policy if exists book_marks_own on public.book_marks;
create policy book_marks_own on public.book_marks for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Diario de partidas → marca Jugada o Dirigida (sin borrar una fecha anterior)
create or replace function public.plays_mark_book()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.book_marks (user_id, catalog_id, played_at, directed_at)
  values (new.user_id, new.catalog_id,
          case when new.role = 'jugado' then new.played_on::timestamptz end,
          case when new.role = 'dirigido' then new.played_on::timestamptz end)
  on conflict (user_id, catalog_id) do update set
    played_at   = coalesce(public.book_marks.played_at, excluded.played_at),
    directed_at = coalesce(public.book_marks.directed_at, excluded.directed_at),
    updated_at  = now();
  return new;
end;
$$;
revoke all on function public.plays_mark_book() from public, anon, authenticated;

drop trigger if exists plays_mark_book on public.plays;
create trigger plays_mark_book after insert on public.plays
  for each row execute function public.plays_mark_book();

-- Traspasar las partidas ya apuntadas
insert into public.book_marks (user_id, catalog_id, played_at, directed_at)
select user_id, catalog_id,
       min(played_on) filter (where role = 'jugado')::timestamptz,
       min(played_on) filter (where role = 'dirigido')::timestamptz
from public.plays
group by user_id, catalog_id
on conflict (user_id, catalog_id) do nothing;
