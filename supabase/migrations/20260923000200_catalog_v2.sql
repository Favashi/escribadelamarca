-- =============================================================
-- Catálogo v2: datos completos del CSV (data/catalogo_marca_del_este.csv)
-- y códigos de barras en tabla aparte (un libro puede tener varios y,
-- por errores de las fuentes, un código puede aparecer en varios libros).
-- =============================================================

-- ---------- Categorías ----------
insert into public.categories (slug, name, sort_order) values
  ('aventuras-b', 'Aventuras serie B',     15),
  ('historicas',  'Aventuras históricas',  25)
on conflict (slug) do nothing;

update public.categories set name = 'Otras aventuras y campañas' where slug = 'aventuras';
update public.categories set name = 'Suplementos de reglas'      where slug = 'suplementos';
update public.categories set name = 'Ambientación y mapas'       where slug = 'ambientacion';

-- ---------- Quitar el catálogo inicial provisional (títulos sin verificar) ----------
delete from public.catalog
where isbn is null and created_by is null
  and title in (
    'Aventuras en la Marca del Este — Caja Roja (Caja Básica)',
    'Aventuras en la Marca del Este — Caja Azul (Expertos)',
    'Aventuras en la Marca del Este — Caja Verde',
    'Clásicos de la Marca'
  );

-- ---------- Nuevas columnas del catálogo ----------
alter table public.catalog
  add column if not exists ref            text unique,       -- clave estable de importación (clave Sombra o codex:<código>)
  add column if not exists code           text,              -- código de publicación: B19, G0, CR…
  add column if not exists series         text,              -- B, X, G…
  add column if not exists number         int,
  add column if not exists author         text,
  add column if not exists kind           text,              -- Suplemento / Básico / Aventura histórica
  add column if not exists binding        text,
  add column if not exists interior       text,
  add column if not exists price_eur      numeric(8,2),
  add column if not exists catalog_date   date,
  add column if not exists isbn_published text,              -- valor literal publicado por Sombra
  add column if not exists sombra_key     text,
  add column if not exists tesoros_sku    text,
  add column if not exists source         text not null default 'app' check (source in ('app', 'csv')),
  add column if not exists meta           jsonb not null default '{}'::jsonb;  -- procedencia y fiabilidad

alter table public.catalog alter column pages type text using pages::text;   -- "180 + pantalla + 15 mapas"

create index if not exists catalog_code_idx on public.catalog (upper(code));

-- ---------- Códigos de barras ----------
create table if not exists public.catalog_barcodes (
  code        text not null check (code ~ '^[0-9]{8,13}$'),
  catalog_id  uuid not null references public.catalog(id) on delete cascade,
  source      text not null default 'usuario' check (source in ('sombra', 'admin', 'usuario')),
  status      text not null default 'pending' check (status in ('approved', 'pending')),
  verified    boolean not null default false,   -- comprobado escaneando un ejemplar físico
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (code, catalog_id)
);
create index if not exists catalog_barcodes_book_idx on public.catalog_barcodes(catalog_id);

-- Mover los ISBN existentes a la nueva tabla
insert into public.catalog_barcodes (code, catalog_id, source, status, verified, created_by)
select isbn, id, 'admin', status, true, created_by from public.catalog where isbn is not null
on conflict do nothing;

drop trigger if exists catalog_normalize on public.catalog;
drop function if exists public.catalog_normalize();
alter table public.catalog drop column if exists isbn;

create or replace function public.barcode_normalize()
returns trigger language plpgsql as $$
begin
  new.code := regexp_replace(new.code, '[^0-9]', '', 'g');
  return new;
end;
$$;

drop trigger if exists barcode_normalize on public.catalog_barcodes;
create trigger barcode_normalize
  before insert or update on public.catalog_barcodes
  for each row execute function public.barcode_normalize();

-- ---------- Permisos y RLS ----------
grant select, insert, update, delete on public.catalog_barcodes to authenticated;
grant all on public.catalog_barcodes to service_role;

alter table public.catalog_barcodes enable row level security;

drop policy if exists barcodes_select on public.catalog_barcodes;
drop policy if exists barcodes_insert on public.catalog_barcodes;
drop policy if exists barcodes_update on public.catalog_barcodes;
drop policy if exists barcodes_delete on public.catalog_barcodes;

create policy barcodes_select on public.catalog_barcodes for select to authenticated
  using (status = 'approved' or created_by = auth.uid() or public.is_admin());
-- Admin: cualquier código. Usuario: propuesta pendiente («este código es de este libro»).
create policy barcodes_insert on public.catalog_barcodes for insert to authenticated
  with check (
    public.is_admin()
    or (status = 'pending' and source = 'usuario' and created_by = auth.uid() and verified = false)
  );
create policy barcodes_update on public.catalog_barcodes for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy barcodes_delete on public.catalog_barcodes for delete to authenticated
  using (public.is_admin() or (status = 'pending' and created_by = auth.uid()));
