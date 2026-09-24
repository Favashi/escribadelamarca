-- Datos propios: cada usuario solo ve y cambia lo suyo; los extras de Mecenas exigen serlo;
-- nadie puede darse permisos de admin o Mecenas desde su perfil.
-- Ejecutar: supabase test db   (cada fichero corre en una transacción que se deshace al final)
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- ---------- Datos de prueba (como postgres) ----------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'u2@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'mecenas@test.local');
update public.profiles set is_supporter = true where id = '33333333-3333-3333-3333-333333333333';
insert into public.catalog (id, title, status, source) values
  ('b0000000-0000-0000-0000-00000000000a', '[Test] Libro A', 'approved', 'app'),
  ('b0000000-0000-0000-0000-00000000000b', '[Test] Libro B', 'approved', 'app');
insert into public.library (user_id, catalog_id) values ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-00000000000a');
insert into public.user_achievements (user_id, key) values ('22222222-2222-2222-2222-222222222222', 'first_book');

-- Cambia de usuario dentro de la transacción (como hace PostgREST con el JWT)
create function public._test_login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;

-- ---------- Usuario normal (u1) ----------
select public._test_login('11111111-1111-1111-1111-111111111111');

select is((select count(*)::int from public.profiles), 1, 'perfiles: solo ve el suyo');
select is_empty($$ select 1 from public.library where user_id = '22222222-2222-2222-2222-222222222222' $$,
  'biblioteca: no ve la de otro usuario');
select lives_ok($$ insert into public.library (user_id, catalog_id) values ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-00000000000a') $$,
  'biblioteca: puede añadir a la suya');
select throws_ok($$ insert into public.library (user_id, catalog_id) values ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'biblioteca: no puede añadir a la de otro');
select lives_ok($$ delete from public.library where user_id = '22222222-2222-2222-2222-222222222222' $$,
  'biblioteca: borrar la de otro no da error (RLS la oculta)…');
select lives_ok($$ update public.library set spares = 5 where user_id = '22222222-2222-2222-2222-222222222222' $$,
  'biblioteca: …ni cambiarla');

select lives_ok($$ update public.profiles set display_name = 'Nuevo nombre' where id = '11111111-1111-1111-1111-111111111111' $$,
  'perfil: puede cambiar su nombre');
select throws_ok($$ update public.profiles set is_admin = true where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'perfil: no puede hacerse admin');
select throws_ok($$ update public.profiles set is_supporter = true where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'perfil: no puede hacerse Mecenas');
select lives_ok($$ update public.profiles set display_name = 'Pirata' where id = '22222222-2222-2222-2222-222222222222' $$,
  'perfil: cambiar el de otro no da error (RLS lo oculta)');

select is_empty($$ select 1 from public.user_achievements $$, 'logros: no ve los de otro');
select throws_ok($$ insert into public.user_achievements (user_id, key) values ('22222222-2222-2222-2222-222222222222', 'trampa') $$,
  '42501', null, 'logros: no puede crear logros a otro');

select lives_ok($$ insert into public.events (type) values ('app_open') $$, 'métricas: registra sus eventos');
select throws_ok($$ insert into public.events (user_id, type) values ('22222222-2222-2222-2222-222222222222', 'app_open') $$,
  '42501', null, 'métricas: no puede registrar eventos de otro');
select is_empty($$ select 1 from public.events $$, 'métricas: no puede leerlas (solo agregadas para admin)');

select lives_ok($$ insert into public.wishlist (user_id, catalog_id) values ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-00000000000b') $$,
  'lista de deseos: disponible para todos (no solo Mecenas)');
select throws_ok($$ insert into public.wishlist (user_id, catalog_id) values ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'lista de deseos: no puede añadir a la de otro');
select throws_ok($$ insert into public.plays (user_id, catalog_id) values ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'Mecenas: sin serlo no puede usar el diario de partidas');
select throws_ok($$ insert into public.loans (user_id, catalog_id, lent_to) values ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-00000000000a', 'Ana') $$,
  '42501', null, 'Mecenas: sin serlo no puede usar préstamos');

select is_empty($$ select 1 from public.donations $$, 'donaciones: invisibles para usuarios');
select is_empty($$ select 1 from public.admin_notifications $$, 'avisos de Telegram: invisibles para usuarios');

-- ---------- Mecenas ----------
select public._test_login('33333333-3333-3333-3333-333333333333');
select lives_ok($$ insert into public.wishlist (user_id, catalog_id) values ('33333333-3333-3333-3333-333333333333', 'b0000000-0000-0000-0000-00000000000b') $$,
  'Mecenas: puede usar la lista de deseos');
select lives_ok($$ insert into public.plays (user_id, catalog_id) values ('33333333-3333-3333-3333-333333333333', 'b0000000-0000-0000-0000-00000000000b') $$,
  'Mecenas: puede usar el diario de partidas');

-- ---------- Comprobación final (como postgres) ----------
reset role;
select is((select spares from public.library where user_id = '22222222-2222-2222-2222-222222222222'), 0,
  'la biblioteca de u2 sigue intacta');
select is((select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 'u2',
  'el nombre de u2 sigue intacto');

select * from finish();
rollback;
