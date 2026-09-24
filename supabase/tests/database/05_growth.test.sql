-- Difusión: canal de origen (signup_ref), visitas anónimas a la portada (landing_visits) y panel de Admin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@test.local');
update public.profiles set is_admin = true where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.landing_visits;

create function public._test_login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
create function public._test_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role": "anon"}', true), set_config('role', 'anon', true);
$$;

select is(public.clean_ref('  Reddit '), 'reddit', 'canal: se normaliza a minúsculas');
select is(public.clean_ref('<script>'), 'otro', 'canal: lo raro cuenta como «otro»');
select is(public.clean_ref(''), null, 'canal: vacío = sin canal');

-- ---------- Visitas anónimas ----------
select public._test_anon();
select lives_ok($$ select public.track_landing('Reddit') $$, 'sin sesión: suma una visita');
select lives_ok($$ select public.track_landing('reddit'); select public.track_landing(null) $$, 'más visitas, con y sin canal');
select is_empty($$ select 1 from public.landing_visits $$, 'sin sesión: no puede leer las visitas');
reset role;
select is((select visits from public.landing_visits where day = current_date and ref = 'reddit'), 2, 'las visitas se agrupan por canal y día');
select is((select visits from public.landing_visits where day = current_date and ref = 'directo'), 1, 'sin canal = «directo»');

-- Tope de 50 canales distintos por día: el resto va a «otro»
select public.track_landing('canal' || g) from generate_series(1, 60) g;
select is((select count(*)::int from public.landing_visits where day = current_date), 51, 'como mucho 50 canales al día (+ «otro»)');

-- ---------- Canal de origen en el perfil ----------
select public._test_login('11111111-1111-1111-1111-111111111111');
select lives_ok($$ update public.profiles set signup_ref = 'jornadas' where id = '11111111-1111-1111-1111-111111111111' $$,
  'el usuario guarda su canal de llegada');
select throws_ok($$ update public.profiles set signup_ref = 'Mal canal!' where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'un canal con formato raro se rechaza');
select throws_ok($$ select public.admin_acquisition() $$, '42501', null, 'usuario: no ve el panel de origen');

-- ---------- Admin ----------
select public._test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select ok((select public.admin_acquisition() @> '[{"ref": "reddit", "visits_30d": 2}]'::jsonb), 'admin: ve las visitas por canal');
select ok((select public.admin_acquisition() @> '[{"ref": "jornadas", "signups_30d": 1, "signups_90d": 1}]'::jsonb),
  'admin: ve las altas por canal');

select * from finish();
rollback;
