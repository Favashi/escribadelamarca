-- =============================================================
-- El catálogo ya no depende del CSV: la base de datos es la única fuente de verdad y se mantiene desde la app
-- (altas y ediciones del admin, propuestas y sugerencias de la comunidad, verificación de códigos).
-- Se retiran los scripts de sincronización con el CSV, y con ellos locked_fields, que solo servía para que
-- esa sincronización no pisara lo editado en la app.
-- =============================================================

drop trigger if exists catalog_lock_edited_fields on public.catalog;
drop function if exists public.catalog_lock_edited_fields();

-- Historial: ignorar las actualizaciones sin cambios reales (antes se descontaba locked_fields)
create or replace function public.record_catalog_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  book uuid := coalesce((n ->> 'catalog_id')::uuid, (o ->> 'catalog_id')::uuid, (n ->> 'id')::uuid, (o ->> 'id')::uuid);
begin
  if tg_op = 'UPDATE' and o = n then
    return new;
  end if;
  insert into public.catalog_history (table_name, catalog_id, op, old_data, new_data, changed_by)
  values (tg_table_name, book,
          case when current_setting('escriba.restoring', true) = 'on' then 'restore' else lower(tg_op) end,
          o, n, auth.uid());
  return coalesce(new, old);
end;
$$;
revoke execute on function public.record_catalog_history() from public, anon, authenticated;

alter table public.catalog drop column if exists locked_fields;
