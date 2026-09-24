-- Monitorización: errores del navegador (client_errors) y avisos sin repetición.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@test.local');
update public.profiles set is_admin = true where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.client_errors;   -- partir de cero (dentro de la transacción: se deshace al final)

create function public._test_login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
create function public._test_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role": "anon"}', true), set_config('role', 'anon', true);
$$;

-- ---------- Visitante sin sesión (errores de la portada) ----------
select public._test_anon();
select lives_ok($$ insert into public.client_errors (kind, message, source) values ('error', 'Fallo en la portada', '/js/app.js:1:1') $$,
  'sin sesión: puede registrar un error');
select throws_ok($$ insert into public.client_errors (user_id, message) values ('11111111-1111-1111-1111-111111111111', 'Suplantado') $$,
  '42501', null, 'sin sesión: no puede registrar errores en nombre de un usuario');
select is_empty($$ select 1 from public.client_errors $$, 'sin sesión: no puede leer los errores');

-- ---------- Usuario ----------
select public._test_login('11111111-1111-1111-1111-111111111111');
select lives_ok($$ insert into public.client_errors (message, stack) values ('Error con pepe@correo.com dentro', 'at x (pepe@correo.com)') $$,
  'usuario: registra un error (queda a su nombre)');
select is_empty($$ select 1 from public.client_errors $$, 'usuario: no puede leer los errores (ni los suyos)');
select throws_ok($$ select public.notify_admin_once('x', 'y') $$, '42501', null, 'usuario: no puede mandar avisos por Telegram');

-- ---------- Comprobaciones (como postgres) ----------
reset role;
select is((select user_id from public.client_errors where message like 'Error con%'), '11111111-1111-1111-1111-111111111111'::uuid,
  'el error del usuario queda asociado a él');
select is((select message from public.client_errors where message like 'Error con%'), 'Error con <email> dentro',
  'los emails se borran del mensaje…');
select is((select stack from public.client_errors where message like 'Error con%'), 'at x (<email>)', '…y de la pila');
select isnt((select signature from public.client_errors where message = 'Fallo en la portada'), null, 'cada error lleva su firma');

-- Misma firma aunque cambien números y línea
insert into public.client_errors (message, source) values ('Falta el libro 123', '/js/a.js:10:2'), ('Falta el libro 456', '/js/a.js:99:7');
select is((select count(distinct signature)::int from public.client_errors where message like 'Falta el libro%'), 1,
  'errores iguales con distintos números o línea se agrupan');

-- Tope por usuario: 20 por hora; el resto se descarta sin error
select lives_ok($$ insert into public.client_errors (user_id, message) select '11111111-1111-1111-1111-111111111111', 'spam ' || g from generate_series(1, 40) g $$,
  'un aluvión de errores no da error…');
select is((select count(*)::int from public.client_errors where user_id = '11111111-1111-1111-1111-111111111111'), 20,
  '…pero solo se guardan 20 por usuario y hora');

-- Tope global: 60 por hora entre todos (sin sesión incluidos)
select lives_ok($$ insert into public.client_errors (user_id, message) select null, 'anónimo ' || g from generate_series(1, 100) g $$,
  'un aluvión anónimo no da error…');
select is((select count(*)::int from public.client_errors), 60, '…pero en total solo se guardan 60 por hora');

-- ---------- Admin ----------
select public._test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select isnt_empty($$ select 1 from public.client_errors $$, 'admin: lee los errores');
reset role;
select ok(has_function_privilege('service_role', 'public.notify_admin_once(text, text, interval, jsonb)', 'execute'),
  'la Edge Function (service_role) puede mandar avisos');

select * from finish();
rollback;
