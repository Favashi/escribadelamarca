-- Datos de prueba: SOLO local y ramas preview (la integración no lo aplica en producción).
-- El catálogo real llega por las migraciones. Aquí solo un libro ficticio con un EAN válido
-- para probar el flujo "código conocido" con la entrada manual (9780306406157).

insert into public.catalog (ref, code, series, number, title, category_id, status, source)
select 'test:T1', 'T1', 'T', 1, '[Prueba] Aventura de test', c.id, 'approved', 'app'
from public.categories c where c.slug = 'aventuras'
on conflict (ref) do nothing;

insert into public.catalog_barcodes (code, catalog_id, source, status, verified)
select '9780306406157', id, 'admin', 'approved', true from public.catalog where ref = 'test:T1'
on conflict do nothing;
