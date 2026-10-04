-- =============================================================
-- Temas del perfil público que se desbloquean con logros, temas de serie y la «Caja Roja» de Mecenas.
--   · profile_theme admite: oro, bosque (gratis) · cartografo (explorer), biblioteca (books:50), dragones (rank:3)
--     · caja, sangre, arcano, escarcha (Mecenas) · serie:<código> (con el logro series:<código>).
--   · profile_theme_allowed(): la misma regla en el servidor; public_profile() enseña «oro» si el tema no está ganado
--     (o si deja de ser Mecenas), así no se puede saltar desde la API.
--   · public_profile() devuelve también theme_covers: las portadas de la serie del tema (si las portadas están activas).
-- =============================================================

alter table public.profiles drop constraint if exists profiles_profile_theme_check;
alter table public.profiles add constraint profiles_profile_theme_check
  check (profile_theme in ('oro', 'bosque', 'cartografo', 'biblioteca', 'dragones', 'caja', 'sangre', 'arcano', 'escarcha')
         or profile_theme ~ '^serie:[A-Za-z0-9_*-]{1,30}$');

create or replace function public.profile_theme_allowed(p_user uuid, p_theme text, p_supporter boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_theme in ('oro', 'bosque') then true
    when p_theme in ('caja', 'sangre', 'arcano', 'escarcha') then coalesce(p_supporter, false)
    else exists (select 1 from public.user_achievements a where a.user_id = p_user and a.key = case p_theme
      when 'cartografo' then 'explorer'
      when 'biblioteca' then 'books:50'
      when 'dragones' then 'rank:3'
      else case when p_theme like 'serie:%' then 'series:' || substr(p_theme, 7) end end)
  end;
$$;
revoke all on function public.profile_theme_allowed(uuid, text, boolean) from public, anon, authenticated;

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
