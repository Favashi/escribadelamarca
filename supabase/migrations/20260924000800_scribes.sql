-- =============================================================
-- Página «Escribas»: agradecimiento voluntario a quienes más aportan al catálogo.
--   · profiles.show_in_scribes: casilla en Perfil (desactivada por defecto; opt-in).
--   · scribes(): solo devuelve a quienes la han activado y tienen alguna aportación aceptada,
--     con el nombre abreviado («Toni R.»). No expone ids, emails ni avatares.
-- Las aportaciones se cuentan igual que contributions() en js/achievements.js.
-- =============================================================

alter table public.profiles
  add column if not exists show_in_scribes boolean not null default false;

-- El usuario puede cambiar su propia casilla (la política profiles_update ya limita a su fila)
grant update (show_in_scribes) on public.profiles to authenticated;

create or replace function public.scribes()
returns table (name text, suggestions int, codes int, books int, total int, is_me boolean)
language sql stable security definer set search_path = public as $$
  with c as (
    select
      p.id,
      nullif(trim(p.display_name), '') as full_name,
      (select count(*) from public.catalog_suggestions s
        where s.created_by = p.id and s.status = 'approved')::int as suggestions,
      (select count(*) from public.catalog_barcodes b
        where b.created_by = p.id and b.status = 'approved' and b.source = 'usuario')::int as codes,
      (select count(*) from public.catalog k
        where k.created_by = p.id and k.status = 'approved' and k.source = 'app')::int as books
    from public.profiles p
    where p.show_in_scribes
  )
  select
    coalesce(
      split_part(full_name, ' ', 1)
        || coalesce(' ' || nullif(left(split_part(full_name, ' ', 2), 1), '') || '.', ''),
      'Escriba anónimo'),
    suggestions, codes, books,
    suggestions + codes + books,
    id = (select auth.uid())
  from c
  where suggestions + codes + books > 0
  order by suggestions + codes + books desc, 1
  limit 100;
$$;
revoke all on function public.scribes() from public, anon;
grant execute on function public.scribes() to authenticated;
