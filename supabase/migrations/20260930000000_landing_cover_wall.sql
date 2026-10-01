-- Portada pública: el muro de portadas de la cabecera necesita más portadas al azar (8 → 48).
-- Mismo contenido que en 20260927000300 (solo datos públicos del catálogo y recuentos).
create or replace function public.landing_showcase()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'covers', case when coalesce((select value from public.app_settings where key = 'covers_enabled'), 'true'::jsonb) = 'true'::jsonb
      then (select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'title', c.title, 'cover_url', c.cover_url)), '[]')
            from (select code, title, cover_url from public.catalog
                  where status = 'approved' and cover_url is not null and code ~ '^[A-Za-z]+[0-9]+$'
                  order by random() limit 48) c)
      else '[]'::jsonb end,
    -- Un descatalogado real con portada, para el ejemplo de la lista de deseos (null si no hay)
    'oop', case when coalesce((select value from public.app_settings where key = 'covers_enabled'), 'true'::jsonb) = 'true'::jsonb
      then (select jsonb_build_object('code', code, 'title', title, 'cover_url', cover_url) from public.catalog
            where status = 'approved' and out_of_print and cover_url is not null order by random() limit 1) end,
    'publications', (select count(*) from public.catalog where status = 'approved'),
    -- Autores distintos: «A, B y C» → A | B | C (sin «vv.aa.»)
    'authors', (select count(distinct lower(trim(a)))
                from public.catalog c, regexp_split_to_table(c.author, ',|\sy\s') a
                where c.status = 'approved' and trim(a) <> '' and lower(trim(a)) !~ '^v\.?\s*v\.?\s*a+\.?\s*a*\.?$'),
    'adventures', (select count(*) from public.catalog
                   where status = 'approved' and (min_level is not null or min_players is not null or sessions is not null)),
    'books_cataloged', (select count(*) from public.library),
    'scribes', (select count(*) from public.profiles p where public.user_contributions(p.id) > 0),
    'supporters', (select count(*) from public.profiles where is_supporter));
$$;
