-- Umbral de Mecenas: un café de Buy Me a Coffee (5 €).
-- Lo usa handle_new_user() para quien donó antes de registrarse.
create or replace function public.supporter_min_amount()
returns numeric language sql immutable as $$ select 5::numeric $$;
