-- =============================================================
-- PX según el esfuerzo de cada aportación aceptada (antes, 100 PX todas):
--   · código de barras propuesto ............ 100
--   · corrección sencilla (título, autor, páginas, fecha, formato, descatalogado…) 100
--   · datos de juego (nivel, jugadores, sesiones) ................................ 150
--   · resumen .................................................................... 200
--   · libro nuevo propuesto ...................................................... 250
-- Una corrección que toca varias cosas cuenta por la de mayor valor (no se suman).
-- Nadie pierde PX: el mínimo sigue siendo 100. Misma fórmula en js/achievements.js (CONTRIB_XP, suggestionXp).
-- =============================================================

create or replace function public.suggestion_xp(changes jsonb)
returns int language sql immutable set search_path = public as $$
  select case
    when changes ? 'summary' then 200
    when changes ?| array['min_level', 'max_level', 'min_players', 'max_players', 'sessions'] then 150
    else 100 end;
$$;

-- PX de las aportaciones aceptadas de un usuario
create or replace function public.user_contribution_xp(uid uuid)
returns int language sql stable security definer set search_path = public as $$
  select (coalesce((select sum(public.suggestion_xp(s.changes)) from public.catalog_suggestions s
                    where s.created_by = uid and s.status = 'approved'), 0)
        + 100 * (select count(*) from public.catalog_barcodes b
                 where b.created_by = uid and b.status = 'approved' and b.source = 'usuario')
        + 250 * (select count(*) from public.catalog k
                 where k.created_by = uid and k.status = 'approved' and k.source = 'app'))::int;
$$;

create or replace function public.user_xp(uid uuid)
returns int language sql stable security definer set search_path = public as $$
  select (public.user_contribution_xp(uid)
        + 25 * (select count(*) from public.user_achievements a where a.user_id = uid and a.key not like 'rank:%')
        + 10 * (select count(*) from public.book_marks m where m.user_id = uid and m.played_at is not null)
        + 10 * (select count(*) from public.book_marks m where m.user_id = uid and m.directed_at is not null))::int;
$$;

revoke all on function public.user_contribution_xp(uuid) from public, anon, authenticated;
revoke all on function public.user_xp(uuid) from public, anon, authenticated;
