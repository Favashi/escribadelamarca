-- Funciones: las de admin rechazan a quien no lo es; las internas no se pueden llamar desde la API;
-- las públicas (lista de deseos, Escribas, intercambio) solo exponen lo que deben; borrar la cuenta borra todo.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'u2@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'mecenas@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'mecenas2@test.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@test.local');
update public.profiles set is_admin = true where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update public.profiles set is_supporter = true, trade_opt_in = true, display_name = 'Mecenas Uno'
  where id in ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
update public.profiles set share_token = 'cccccccc-cccc-cccc-cccc-cccccccccccc' where id = '33333333-3333-3333-3333-333333333333';
insert into public.catalog (id, title, status, source) values
  ('b0000000-0000-0000-0000-00000000000a', '[Test] Deseado', 'approved', 'csv'),
  ('b0000000-0000-0000-0000-00000000000b', '[Test] Ya lo tengo', 'approved', 'csv');
insert into public.wishlist (user_id, catalog_id) values
  ('33333333-3333-3333-3333-333333333333', 'b0000000-0000-0000-0000-00000000000a'),
  ('33333333-3333-3333-3333-333333333333', 'b0000000-0000-0000-0000-00000000000b');
insert into public.library (user_id, catalog_id) values
  ('33333333-3333-3333-3333-333333333333', 'b0000000-0000-0000-0000-00000000000b'),
  ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-00000000000b');
insert into public.library (user_id, catalog_id, spares) values ('44444444-4444-4444-4444-444444444444', 'b0000000-0000-0000-0000-00000000000a', 1);
-- Aportaciones aceptadas para Escribas: u1 (opt-in) y u2 (sin opt-in)
insert into public.catalog_barcodes (code, catalog_id, source, status, verified, created_by) values
  ('9780306406157', 'b0000000-0000-0000-0000-00000000000a', 'usuario', 'approved', true, '11111111-1111-1111-1111-111111111111'),
  ('9780262033848', 'b0000000-0000-0000-0000-00000000000a', 'usuario', 'approved', true, '22222222-2222-2222-2222-222222222222');
update public.profiles set show_in_scribes = true, display_name = 'Ana García López' where id = '11111111-1111-1111-1111-111111111111';

create function public._test_login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
create function public._test_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role": "anon"}', true), set_config('role', 'anon', true);
$$;

-- ---------- Funciones internas: nunca ejecutables desde la API ----------
select ok(not has_function_privilege(r, f, 'execute'), format('%s no puede ejecutar %s', r, f))
from unnest(array['anon', 'authenticated']) r,
     unnest(array['public.notify_admin(text, jsonb)', 'public.telegram_send(text, jsonb)', 'public.mark_supporter_by_email(text)',
                  'public.weekly_admin_digest()', 'public.retry_admin_notifications()', 'public.tg_who(uuid)']) f;
select ok(not has_function_privilege('anon', 'public.delete_my_account()', 'execute'), 'anon no puede ejecutar delete_my_account');

-- ---------- Funciones de admin: rechazan a usuarios y visitantes ----------
select public._test_login('11111111-1111-1111-1111-111111111111');
select throws_ok($$ select public.admin_users() $$, '42501', null, 'usuario: admin_users rechazado');
select throws_ok($$ select public.admin_metrics() $$, '42501', null, 'usuario: admin_metrics rechazado');
select throws_ok($$ select public.admin_donations() $$, '42501', null, 'usuario: admin_donations rechazado');
select throws_ok($$ select public.admin_set_supporter('11111111-1111-1111-1111-111111111111', true) $$, '42501', null,
  'usuario: no puede hacerse Mecenas con admin_set_supporter');
select throws_ok($$ select public.admin_match_donation(1, '11111111-1111-1111-1111-111111111111') $$, '42501', null,
  'usuario: admin_match_donation rechazado');
select throws_ok($$ select public.admin_reject_suggestion(1, 'no') $$, '42501', null, 'usuario: admin_reject_suggestion rechazado');
select throws_ok($$ select public.admin_apply_suggestion(1, '{}') $$, '42501', null, 'usuario: admin_apply_suggestion rechazado');
select throws_ok($$ select public.admin_restore_version(1) $$, '42501', null, 'usuario: admin_restore_version rechazado');

select public._test_anon();
select throws_ok($$ select public.admin_users() $$, '42501', null, 'sin sesión: admin_users rechazado');
select throws_ok($$ select public.admin_set_supporter('11111111-1111-1111-1111-111111111111', true) $$, '42501', null,
  'sin sesión: admin_set_supporter rechazado');

select public._test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select lives_ok($$ select public.admin_users() $$, 'admin: admin_users funciona');
select lives_ok($$ select public.admin_metrics() $$, 'admin: admin_metrics funciona');
select lives_ok($$ select public.admin_set_supporter('22222222-2222-2222-2222-222222222222', true) $$, 'admin: puede hacer Mecenas a alguien');

-- ---------- Lista de deseos compartida (pública con el enlace) ----------
select public._test_anon();
select results_eq($$ select title from public.public_wishlist('cccccccc-cccc-cccc-cccc-cccccccccccc') $$,
  $$ values ('[Test] Deseado'::text) $$, 'lista compartida: muestra lo deseado y oculta lo que ya tiene');
select is_empty($$ select 1 from public.public_wishlist('dddddddd-dddd-dddd-dddd-dddddddddddd') $$, 'lista compartida: un enlace falso no muestra nada');
select is_empty($$ select 1 from public.public_wishlist(null) $$, 'lista compartida: sin enlace no muestra nada');

-- ---------- Intercambio (solo entre Mecenas que lo activan) ----------
select public._test_login('33333333-3333-3333-3333-333333333333');
select results_eq($$ select title, spares from public.trade_matches() $$, $$ values ('[Test] Deseado'::text, 1) $$,
  'intercambio: el Mecenas ve el repetido de otro Mecenas');
reset role;
update public.profiles set trade_opt_in = false where id = '44444444-4444-4444-4444-444444444444';
select public._test_login('33333333-3333-3333-3333-333333333333');
select is_empty($$ select 1 from public.trade_matches() $$, 'intercambio: quien no lo activa no aparece');
select public._test_login('11111111-1111-1111-1111-111111111111');
select is_empty($$ select 1 from public.trade_matches() $$, 'intercambio: un usuario normal no ve nada');

-- ---------- Escribas (voluntario) ----------
select results_eq($$ select name, total, is_me from public.scribes() $$, $$ values ('Ana G.'::text, 1, true) $$,
  'Escribas: solo quien lo activa, con el nombre abreviado');
select public._test_anon();
select throws_ok($$ select public.scribes() $$, '42501', null, 'Escribas: sin sesión no se puede consultar');

-- ---------- Borrar la cuenta ----------
select public._test_anon();
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'sin sesión: no puede borrar ninguna cuenta');
select public._test_login('11111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.delete_my_account() $$, 'el usuario borra su cuenta');
reset role;
select is_empty($$ select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111' $$, 'borrar cuenta: desaparece el usuario');
select is_empty($$ select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$, 'borrar cuenta: desaparece el perfil');
select is_empty($$ select 1 from public.library where user_id = '11111111-1111-1111-1111-111111111111' $$, 'borrar cuenta: desaparece su biblioteca');
select is((select created_by from public.catalog_barcodes where code = '9780306406157' and catalog_id = 'b0000000-0000-0000-0000-00000000000a'), null,
  'borrar cuenta: sus aportaciones quedan en el catálogo, sin autor');
select isnt_empty($$ select 1 from public.profiles where id = '22222222-2222-2222-2222-222222222222' and is_supporter $$,
  'la acción del admin (Mecenas) se aplicó');

select * from finish();
rollback;
