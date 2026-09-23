-- Advisors: funciones internas que no deben poder llamarse por la API.
-- Las funciones de trigger siguen funcionando: PostgreSQL no comprueba EXECUTE al dispararlas.
--
-- Avisos que se mantienen A PROPÓSITO (security definer llamables):
--   public_wishlist (anon)         → lista de deseos compartida por enlace, sin login
--   admin_*        (authenticated) → cada una valida is_admin() y falla si no lo es
--   is_admin / is_supporter        → las usan las políticas RLS; como invoker entrarían en bucle
--   delete_my_account, trade_matches → operan solo sobre auth.uid()

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.notify_on_event() from public, anon, authenticated;
revoke execute on function public.assert_admin()    from public, anon, authenticated;

-- rls_auto_enable la crea Supabase con la opción «Enable automatic RLS»: puede no existir en local/preview
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
