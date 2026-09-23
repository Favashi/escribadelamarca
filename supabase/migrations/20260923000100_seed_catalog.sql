-- =============================================================
-- Catálogo inicial de producción (va en migración: seed.sql no llega a producción).
-- Títulos de partida SIN ISBN. Para añadir más, crea una migración nueva.
-- Los ISBN se asignan desde la app: como admin, escanea el libro
-- y elige "Asignar a un libro existente".
-- =============================================================

insert into public.catalog (title, category_id, status)
select v.title, c.id, 'approved'
from (values
  ('Aventuras en la Marca del Este — Caja Roja (Caja Básica)', 'reglamento'),
  ('Aventuras en la Marca del Este — Caja Azul (Expertos)',    'reglamento'),
  ('Aventuras en la Marca del Este — Caja Verde',              'reglamento'),
  ('Clásicos de la Marca',                                     'reglamento')
) as v(title, slug)
join public.categories c on c.slug = v.slug
where not exists (select 1 from public.catalog x where x.title = v.title);
