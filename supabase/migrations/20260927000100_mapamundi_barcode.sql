-- Mapamundi de Valion (MP): código de barras impreso con errata, 9788493585823 (el dígito de control correcto
-- sería 2: es «978» + el ISBN-10 84-935858-2-3 sin recalcular). Comprobado en un ejemplar (2026-09-27).
-- Se registra tal cual para que, escrito a mano en «Escanear», lleve a este libro (la app lo admite desde v1.11.1).
insert into public.catalog_barcodes (code, catalog_id, source, status, verified)
select '9788493585823', id, 'admin', 'approved', true
from public.catalog
where upper(code) = 'MP' and title ilike 'Mapamundi de Valion%'
on conflict do nothing;
