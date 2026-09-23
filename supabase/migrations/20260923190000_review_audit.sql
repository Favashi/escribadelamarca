-- =============================================================
-- Revisión: quién y cuándo aprobó cada libro / código de barras.
-- Se rellena solo con un trigger al pasar de 'pending' a 'approved'
-- (o al crear algo ya aprobado desde la app, p. ej. un admin).
-- =============================================================

alter table public.catalog
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

alter table public.catalog_barcodes
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

create or replace function public.stamp_approval()
returns trigger language plpgsql as $$
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved')
     and auth.uid() is not null then          -- migraciones/CSV (sin usuario) no se sellan
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_stamp_approval on public.catalog;
create trigger catalog_stamp_approval
  before insert or update of status on public.catalog
  for each row execute function public.stamp_approval();

drop trigger if exists barcodes_stamp_approval on public.catalog_barcodes;
create trigger barcodes_stamp_approval
  before insert or update of status on public.catalog_barcodes
  for each row execute function public.stamp_approval();
