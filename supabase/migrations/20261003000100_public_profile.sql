-- =============================================================
-- Perfil público de escriba (#/escriba/<slug>), estilo Steam. Voluntario: desactivado por defecto.
--   · profiles.public_profile, public_slug (único), profile_theme, profile_title (clave de logro), profile_motto,
--     profile_banner (un libro de su biblioteca), profile_featured (hasta 3 logros), profile_show (secciones visibles).
--   · public_profile(slug): para anon. Solo datos que el usuario decide enseñar; nunca email ni nombre de Google
--     (salvo que no tenga apodo: entonces el abreviado, como en la Comunidad). Nada si está desactivado o suspendido.
--   · Temas de Mecenas: si deja de serlo, se enseña el tema gratuito. El título solo si tiene ese logro.
-- =============================================================

alter table public.profiles
  add column if not exists public_profile boolean not null default false,
  add column if not exists public_slug text unique
    check (public_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$'),
  add column if not exists profile_theme text not null default 'oro'
    check (profile_theme in ('oro', 'bosque', 'sangre', 'arcano', 'escarcha')),
  add column if not exists profile_title text
    check (profile_title is null or (profile_title ~ '^[a-z_]+(:[A-Za-z0-9_*-]+)?$' and char_length(profile_title) <= 40)),
  add column if not exists profile_motto text check (char_length(profile_motto) <= 80),
  add column if not exists profile_banner uuid references public.catalog(id) on delete set null,
  add column if not exists profile_featured text[] not null default '{}' check (cardinality(profile_featured) <= 3),
  add column if not exists profile_show jsonb not null
    default '{"series": true, "contributions": true, "plays": true, "shelf": false}'::jsonb
    check (jsonb_typeof(profile_show) = 'object' and pg_column_size(profile_show) < 500);

grant update (public_profile, public_slug, profile_theme, profile_title, profile_motto, profile_banner, profile_featured, profile_show)
  on public.profiles to authenticated;

create or replace function public.public_profile(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
  covers boolean := coalesce((select value from public.app_settings where key = 'covers_enabled'), 'true'::jsonb) = 'true'::jsonb;
  shows jsonb;
  xp int;
  result jsonb;
begin
  select * into p from public.profiles
   where public_slug = lower(btrim(p_slug)) and public_profile and suspended_at is null;
  if p.id is null then return null; end if;
  shows := p.profile_show;
  xp := public.user_xp(p.id);

  select jsonb_build_object(
    'name', public.public_display_name(p),
    'emblem', p.emblem,
    'supporter', p.is_supporter,
    'since', p.created_at,
    'xp', xp,
    'level', public.xp_level(xp),
    'theme', case when p.profile_theme in ('sangre', 'arcano', 'escarcha') and not p.is_supporter then 'oro' else p.profile_theme end,
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
