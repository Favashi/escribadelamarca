-- =============================================================
-- Retratos e ilustraciones de cabecera (dibujos de Gordy Higgins, dominio público) para el perfil.
--   · profiles.portrait: retrato grande (ficha del Perfil y perfil público); el emblema de icono sigue en lo pequeño.
--   · profiles.portrait_style: acabado del retrato: color (plano, por categoría), bn (blanco y negro) o inv (invertido).
--   · profiles.profile_scene: escena de partida como cabecera del perfil público (en lugar de la portada).
--   · portrait_allowed(): algunos retratos se ganan con logros (liche: rank:3; contemplador: explorer). Si no, no se enseña.
-- =============================================================

alter table public.profiles
  add column if not exists portrait text check (portrait ~ '^[a-z0-9-]{1,40}$'),
  add column if not exists portrait_style text not null default 'color' check (portrait_style in ('color', 'bn', 'inv')),
  add column if not exists profile_scene text check (profile_scene ~ '^[a-z0-9-]{1,40}$');

grant update (portrait, portrait_style, profile_scene) on public.profiles to authenticated;

create or replace function public.portrait_allowed(p_user uuid, p_portrait text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_portrait
    when 'liche' then exists (select 1 from public.user_achievements a where a.user_id = p_user and a.key = 'rank:3')
    when 'contemplador' then exists (select 1 from public.user_achievements a where a.user_id = p_user and a.key = 'explorer')
    else p_portrait is not null
  end;
$$;
revoke all on function public.portrait_allowed(uuid, text) from public, anon, authenticated;

create or replace function public.public_profile(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
  covers boolean := coalesce((select value from public.app_settings where key = 'covers_enabled'), 'true'::jsonb) = 'true'::jsonb;
  shows jsonb;
  xp int;
  theme text;
  result jsonb;
begin
  select * into p from public.profiles
   where public_slug = lower(btrim(p_slug)) and public_profile and suspended_at is null;
  if p.id is null then return null; end if;
  shows := p.profile_show;
  xp := public.user_xp(p.id);
  theme := case when public.profile_theme_allowed(p.id, p.profile_theme, p.is_supporter) then p.profile_theme else 'oro' end;

  select jsonb_build_object(
    'name', public.public_display_name(p),
    'emblem', p.emblem,
    'portrait', case when public.portrait_allowed(p.id, p.portrait) then p.portrait end,
    'portrait_style', p.portrait_style,
    'scene', p.profile_scene,
    'supporter', p.is_supporter,
    'since', p.created_at,
    'xp', xp,
    'level', public.xp_level(xp),
    'theme', theme,
    'theme_covers', case when covers and theme like 'serie:%' then (
      select coalesce(jsonb_agg(c.cover_url order by c.number nulls last, c.code), '[]') from public.catalog c
       where c.status = 'approved' and c.series = substr(theme, 7) and c.cover_url is not null) end,
    'title', case
      when p.profile_title = 'supporter' and p.is_supporter then p.profile_title
      when exists (select 1 from public.user_achievements a where a.user_id = p.id and a.key = p.profile_title) then p.profile_title
      end,
    'motto', p.profile_motto,
    'banner', case when covers then (select c.cover_url from public.catalog c
                where c.id = p.profile_banner and exists (select 1 from public.library l where l.user_id = p.id and l.catalog_id = c.id)) end,
    'featured', (select coalesce(jsonb_agg(f), '[]') from unnest(p.profile_featured) f
                 where exists (select 1 from public.user_achievements a where a.user_id = p.id and a.key = f)),
    'achievements', (select coalesce(jsonb_agg(jsonb_build_object('key', a.key, 'earned_at', a.earned_at, 'meta', a.meta)
                     order by a.earned_at), '[]') from public.user_achievements a where a.user_id = p.id),
    'books', (select count(*) from public.library l where l.user_id = p.id),
    'show', shows,
    'plays', case when coalesce((shows->>'plays')::boolean, true) then jsonb_build_object(
      'played', (select count(*) from public.book_marks m where m.user_id = p.id and m.played_at is not null),
      'directed', (select count(*) from public.book_marks m where m.user_id = p.id and m.directed_at is not null)) end,
    'contributions', case when coalesce((shows->>'contributions')::boolean, true) then jsonb_build_object(
      'game', (select count(*) from public.catalog_suggestions s where s.created_by = p.id and s.status = 'approved'
               and public.suggestion_xp(s.changes) = 150),
      'summary', (select count(*) from public.catalog_suggestions s where s.created_by = p.id and s.status = 'approved'
               and public.suggestion_xp(s.changes) = 200),
      'fix', (select count(*) from public.catalog_suggestions s where s.created_by = p.id and s.status = 'approved'
               and public.suggestion_xp(s.changes) = 100),
      'code', (select count(*) from public.catalog_barcodes b where b.created_by = p.id and b.status = 'approved' and b.source = 'usuario'),
      'book', (select count(*) from public.catalog k where k.created_by = p.id and k.status = 'approved' and k.source = 'app')) end,
    -- Series que colecciona (al menos uno): tira de portadas con lo que tiene y lo que le falta
    'series', case when coalesce((shows->>'series')::boolean, true) then (
      select coalesce(jsonb_agg(jsonb_build_object('series', s.series, 'owned', s.owned, 'total', s.total, 'books', s.books)
             order by s.owned = s.total desc, s.owned desc, s.series), '[]')
      from (
        select c.series,
               count(*) filter (where l.catalog_id is not null)::int as owned,
               count(*)::int as total,
               jsonb_agg(jsonb_build_object('code', c.code, 'owned', l.catalog_id is not null,
                         'cover_url', case when covers and l.catalog_id is not null then c.cover_url end)
                         order by c.number nulls last, c.code) as books
        from public.catalog c
        left join public.library l on l.catalog_id = c.id and l.user_id = p.id
        where c.status = 'approved' and c.series is not null
        group by c.series
        having count(*) >= 2 and count(*) filter (where l.catalog_id is not null) > 0
        order by 2 desc
        limit 8) s) end,
    'shelf', case when coalesce((shows->>'shelf')::boolean, false) then (
      select coalesce(jsonb_agg(jsonb_build_object('code', t.code, 'title', t.title, 'cover_url', t.cover_url)), '[]')
      from (select c.code, c.title, case when covers then c.cover_url end as cover_url
            from public.library l join public.catalog c on c.id = l.catalog_id
            where l.user_id = p.id order by l.added_at desc limit 12) t) end
  ) into result;
  return result;
end;
$$;
revoke all on function public.public_profile(text) from public;
grant execute on function public.public_profile(text) to anon, authenticated;
