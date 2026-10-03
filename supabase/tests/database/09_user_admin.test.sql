-- Administración de usuarios: suspender bloquea la escritura (políticas restrictive), solo el admin suspende y la
-- ficha de usuario es solo para el admin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'u2@test.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@test.local');
update public.profiles set is_admin = true where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update public.profiles set show_in_scribes = true where id = '11111111-1111-1111-1111-111111111111';
insert into public.catalog (id, title, status, source) values
  ('b0000000-0000-0000-0000-00000000000a', '[Test] Libro A', 'approved', 'app'),
  ('b0000000-0000-0000-0000-00000000000b', '[Test] Libro B', 'approved', 'app');
insert into public.catalog_barcodes (code, catalog_id, source, status, verified, created_by)
values ('9780306406157', 'b0000000-0000-0000-0000-00000000000a', 'usuario', 'approved', true, '11111111-1111-1111-1111-111111111111');

create function public._test_login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;

-- Solo el admin suspende, y no a sí mismo
select public._test_login('22222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.admin_set_suspended('11111111-1111-1111-1111-111111111111') $$, '42501', null,
  'un usuario no puede suspender a nadie');
select throws_ok($$ select public.admin_user_detail('11111111-1111-1111-1111-111111111111') $$, '42501', null,
  'un usuario no puede ver la ficha de otro');
select throws_ok($$ update public.profiles set suspended_at = null where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null, 'nadie puede tocar su propia suspensión');

select public._test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select throws_ok($$ select public.admin_set_suspended('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$, 'P0001', 'No puedes suspenderte a ti mismo',
  'el admin no se suspende a sí mismo');
select is((public.admin_user_detail('11111111-1111-1111-1111-111111111111')->'contributions'->>'approved')::int, 1,
  'ficha: cuenta las aportaciones aceptadas');
select lives_ok($$ select public.admin_set_suspended('11111111-1111-1111-1111-111111111111', 'Pruebas') $$, 'el admin suspende');

-- El suspendido no escribe nada y deja de salir en la Comunidad
select public._test_login('11111111-1111-1111-1111-111111111111');
select throws_ok($$ insert into public.library (user_id, catalog_id) values ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'suspendido: no puede añadir libros');
select throws_ok($$ insert into public.catalog_suggestions (catalog_id, changes) values ('b0000000-0000-0000-0000-00000000000b', '{"pages": "1"}') $$,
  '42501', null, 'suspendido: no puede proponer');
select is_empty($$ select 1 from public.scribes() $$, 'suspendido: no sale en la Comunidad');

select public._test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select public.admin_set_suspended('11111111-1111-1111-1111-111111111111', null, false);
select public._test_login('11111111-1111-1111-1111-111111111111');
select lives_ok($$ insert into public.library (user_id, catalog_id) values ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-00000000000b') $$,
  'reactivado: vuelve a poder añadir libros');

select * from finish();
rollback;
