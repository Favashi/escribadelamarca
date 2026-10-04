-- Perfil público: solo si está activado y no suspendido; tema de Mecenas solo para Mecenas; temas de logro y de serie solo
-- con el logro; título solo si tiene el logro.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'u2@test.local');
insert into public.catalog (id, title, code, series, number, status, source) values
  ('b0000000-0000-0000-0000-00000000000a', '[Test] QZ1', 'QZ1', 'QZ', 1, 'approved', 'app'),
  ('b0000000-0000-0000-0000-00000000000b', '[Test] QZ2', 'QZ2', 'QZ', 2, 'approved', 'app');
insert into public.library (user_id, catalog_id) values ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-00000000000a');
insert into public.user_achievements (user_id, key) values ('11111111-1111-1111-1111-111111111111', 'first_book');
update public.profiles set public_profile = true, public_slug = 'escriba-test', public_name = 'Escriba Test',
  profile_theme = 'sangre', profile_title = 'first_book', profile_motto = 'Ningún módulo sin leer',
  profile_featured = '{first_book,books:10}'
  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set public_slug = 'privado', profile_title = 'books:100' where id = '22222222-2222-2222-2222-222222222222';

create function public._test_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role": "anon"}', true), set_config('role', 'anon', true);
$$;
select public._test_anon();

select is(public.public_profile('escriba-test')->>'name', 'Escriba Test', 'sin sesión se ve el perfil activado con el apodo');
select is(public.public_profile('ESCRIBA-TEST ')->>'name', 'Escriba Test', 'la dirección no distingue mayúsculas ni espacios');
select is(public.public_profile('privado'), null, 'un perfil no activado no se ve');
select is(public.public_profile('escriba-test')->>'theme', 'oro', 'tema de Mecenas sin ser Mecenas: se enseña el gratuito');
select is(public.public_profile('escriba-test')->>'title', 'first_book', 'el título se enseña si tiene el logro');
select is(public.public_profile('escriba-test')->'featured', '["first_book"]'::jsonb, 'solo los logros destacados que tiene');
select is((public.public_profile('escriba-test')->'series'->0->>'owned')::int, 1, 'series: cuenta los que tiene');

-- Temas de logro y de serie: sin el logro se enseña «oro»; con él, el tema (y las portadas de la serie)
reset role;
update public.catalog set cover_url = 'https://example.test/qz1.jpg' where id = 'b0000000-0000-0000-0000-00000000000a';
update public.profiles set profile_theme = 'serie:QZ' where id = '11111111-1111-1111-1111-111111111111';
select public._test_anon();
select is(public.public_profile('escriba-test')->>'theme', 'oro', 'tema de serie sin completarla: el gratuito');
reset role;
insert into public.user_achievements (user_id, key) values ('11111111-1111-1111-1111-111111111111', 'series:QZ');
select public._test_anon();
select is(public.public_profile('escriba-test')->>'theme', 'serie:QZ', 'con el logro de la serie, su tema');
select is(public.public_profile('escriba-test')->'theme_covers', '["https://example.test/qz1.jpg"]'::jsonb, 'el tema de serie trae sus portadas');
reset role;
update public.profiles set profile_theme = 'cartografo' where id = '11111111-1111-1111-1111-111111111111';
select public._test_anon();
select is(public.public_profile('escriba-test')->>'theme', 'oro', 'Cartógrafo sin ser Explorador: el gratuito');
reset role;
update public.profiles set profile_theme = 'caja', is_supporter = true where id = '11111111-1111-1111-1111-111111111111';
select public._test_anon();
select is(public.public_profile('escriba-test')->>'theme', 'caja', 'Caja Roja para un Mecenas');
reset role;
select throws_ok($$update public.profiles set profile_theme = 'inventado' where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'un tema que no existe no se puede guardar');

update public.profiles set suspended_at = now() where id = '11111111-1111-1111-1111-111111111111';
select public._test_anon();
select is(public.public_profile('escriba-test'), null, 'un suspendido no tiene perfil público');

select * from finish();
rollback;
