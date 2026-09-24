-- Marcas por libro (leída, jugada, dirigida): cada uno las suyas; el diario de partidas marca solo.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'u2@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'mecenas@test.local');
update public.profiles set is_supporter = true where id = '33333333-3333-3333-3333-333333333333';
insert into public.catalog (id, title, status, source) values ('b0000000-0000-0000-0000-00000000000a', '[Test] Libro A', 'approved', 'app');
insert into public.book_marks (user_id, catalog_id, read_at) values ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-00000000000a', now());

create function public._test_login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;

select public._test_login('11111111-1111-1111-1111-111111111111');
select lives_ok($$ insert into public.book_marks (catalog_id, read_at) values ('b0000000-0000-0000-0000-00000000000a', now()) $$,
  'cualquiera marca un libro que no tiene (no hace falta tenerlo)');
select is_empty($$ select 1 from public.library $$, '…y marcarlo no lo añade a la biblioteca');
select is((select count(*)::int from public.book_marks), 1, 'solo ve sus marcas');
select throws_ok($$ insert into public.book_marks (user_id, catalog_id, played_at) values ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-00000000000a', now()) $$,
  '42501', null, 'no puede marcar libros a otro');
select lives_ok($$ update public.book_marks set read_at = null where user_id = '22222222-2222-2222-2222-222222222222' $$,
  'cambiar las marcas de otro no da error…');

-- Diario de Mecenas → marca Jugada / Dirigida
select public._test_login('33333333-3333-3333-3333-333333333333');
insert into public.plays (user_id, catalog_id, role, played_on) values ('33333333-3333-3333-3333-333333333333', 'b0000000-0000-0000-0000-00000000000a', 'dirigido', '2026-05-01');
select isnt((select directed_at from public.book_marks where catalog_id = 'b0000000-0000-0000-0000-00000000000a'), null,
  'apuntar una partida dirigida en el diario la marca como Dirigida');
insert into public.plays (user_id, catalog_id, role, played_on) values ('33333333-3333-3333-3333-333333333333', 'b0000000-0000-0000-0000-00000000000a', 'dirigido', '2026-06-01');
select is((select directed_at::date from public.book_marks where catalog_id = 'b0000000-0000-0000-0000-00000000000a'), '2026-05-01'::date,
  'otra partida no cambia la fecha de la primera');

reset role;
select isnt((select read_at from public.book_marks where user_id = '22222222-2222-2222-2222-222222222222'), null,
  '…las marcas de u2 siguen intactas');

select * from finish();
rollback;
