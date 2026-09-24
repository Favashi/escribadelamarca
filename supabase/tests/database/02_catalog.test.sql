-- Catálogo común: los usuarios ven lo aprobado y proponen (pendiente); solo el admin aprueba y edita.
-- Interruptores de Admin → Ajustes (sugerencias y comentarios) respetados por RLS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'u2@test.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@test.local');
update public.profiles set is_admin = true where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into public.catalog (id, title, status, source, created_by) values
  ('b0000000-0000-0000-0000-00000000000a', '[Test] Aprobado', 'approved', 'app', null),
  ('b0000000-0000-0000-0000-00000000000b', '[Test] Propuesto por u2', 'pending', 'app', '22222222-2222-2222-2222-222222222222');
insert into public.catalog_barcodes (code, catalog_id, source, status, verified, created_by) values
  ('9780306406157', 'b0000000-0000-0000-0000-00000000000b', 'usuario', 'pending', false, '22222222-2222-2222-2222-222222222222');
insert into public.catalog_suggestions (catalog_id, changes, created_by) values
  ('b0000000-0000-0000-0000-00000000000a', '{"author": "Otro"}', '22222222-2222-2222-2222-222222222222');

create function public._test_login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
create function public._test_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role": "anon"}', true), set_config('role', 'anon', true);
$$;

-- ---------- Usuario normal ----------
select public._test_login('11111111-1111-1111-1111-111111111111');

select isnt_empty($$ select 1 from public.catalog where id = 'b0000000-0000-0000-0000-00000000000a' $$, 've los libros aprobados');
select is_empty($$ select 1 from public.catalog where id = 'b0000000-0000-0000-0000-00000000000b' $$, 'no ve las propuestas de otros');
select is_empty($$ select 1 from public.catalog_barcodes where catalog_id = 'b0000000-0000-0000-0000-00000000000b' $$, 'no ve los códigos propuestos por otros');
select is_empty($$ select 1 from public.catalog_suggestions $$, 'no ve las sugerencias de otros');
select is_empty($$ select 1 from public.catalog_history $$, 'no ve el historial (solo admin)');

select lives_ok($$ insert into public.catalog (id, title, status, created_by) values
  ('b0000000-0000-0000-0000-0000000000c1', '[Test] Mi propuesta', 'pending', '11111111-1111-1111-1111-111111111111') $$,
  'puede proponer un libro (pendiente)');
select isnt_empty($$ select 1 from public.catalog where id = 'b0000000-0000-0000-0000-0000000000c1' $$, 've su propia propuesta');
select throws_ok($$ insert into public.catalog (title, status, created_by) values ('[Test] Colado', 'approved', '11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'no puede crear libros aprobados');
select throws_ok($$ insert into public.catalog (title, status, created_by) values ('[Test] Suplantado', 'pending', '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'no puede proponer en nombre de otro');
select lives_ok($$ update public.catalog set title = 'Hackeado' where id = 'b0000000-0000-0000-0000-00000000000a' $$,
  'editar un libro aprobado no da error…');
select lives_ok($$ delete from public.catalog where id = 'b0000000-0000-0000-0000-00000000000a' $$, '…ni borrarlo (RLS lo impide en silencio)');
select lives_ok($$ delete from public.catalog where id = 'b0000000-0000-0000-0000-0000000000c1' $$, 'puede retirar su propuesta pendiente');

select lives_ok($$ insert into public.catalog_barcodes (code, catalog_id, source, status, verified, created_by) values
  ('9780262033848', 'b0000000-0000-0000-0000-00000000000a', 'usuario', 'pending', false, '11111111-1111-1111-1111-111111111111') $$,
  'puede proponer un código (pendiente, sin verificar)');
select throws_ok($$ insert into public.catalog_barcodes (code, catalog_id, source, status, verified, created_by) values
  ('9780131103627', 'b0000000-0000-0000-0000-00000000000a', 'usuario', 'approved', false, '11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'no puede crear códigos aprobados');
select throws_ok($$ insert into public.catalog_barcodes (code, catalog_id, source, status, verified, created_by) values
  ('9780131103627', 'b0000000-0000-0000-0000-00000000000a', 'usuario', 'pending', true, '11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'no puede marcar códigos como verificados');
select throws_ok($$ insert into public.catalog_barcodes (code, catalog_id, source, status, verified, created_by) values
  ('9780131103627', 'b0000000-0000-0000-0000-00000000000a', 'admin', 'pending', false, '11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'no puede hacerse pasar por el admin como fuente');

select throws_ok($$ insert into public.categories (slug, name) values ('trampa', 'Trampa') $$, '42501', null, 'no puede crear categorías');
select lives_ok($$ update public.app_settings set value = 'false' where key = 'donations_enabled' $$, 'cambiar un ajuste no da error…');
select throws_ok($$ insert into public.app_settings (key, value) values ('nuevo', 'true') $$, '42501', null, '…ni puede crear ajustes');

-- ---------- Interruptores ----------
select lives_ok($$ insert into public.catalog_suggestions (catalog_id, changes, created_by) values
  ('b0000000-0000-0000-0000-00000000000a', '{"pages": "32"}', '11111111-1111-1111-1111-111111111111') $$,
  'sugerencias activadas: puede sugerir');
select lives_ok($$ insert into public.feedback (user_id, kind, message) values ('11111111-1111-1111-1111-111111111111', 'idea', 'Una idea') $$,
  'comentarios activados: puede enviar');
reset role;
update public.app_settings set value = 'false' where key in ('suggestions_enabled', 'feedback_enabled');
select public._test_login('11111111-1111-1111-1111-111111111111');
select throws_ok($$ insert into public.catalog_suggestions (catalog_id, changes, created_by) values
  ('b0000000-0000-0000-0000-00000000000a', '{"pages": "33"}', '11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'sugerencias pausadas: no puede sugerir');
select throws_ok($$ insert into public.feedback (user_id, kind, message) values ('11111111-1111-1111-1111-111111111111', 'idea', 'Otra idea') $$,
  '42501', null, 'comentarios desactivados: no puede enviar');
select is_empty($$ select 1 from public.feedback $$, 'no puede leer comentarios (ni los suyos)');

-- ---------- Visitante sin sesión ----------
select public._test_anon();
select is_empty($$ select 1 from public.catalog $$, 'sin sesión: no ve el catálogo');
select isnt_empty($$ select 1 from public.app_settings $$, 'sin sesión: lee los ajustes (la portada los necesita)');

-- ---------- Admin ----------
select public._test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select isnt_empty($$ select 1 from public.catalog where id = 'b0000000-0000-0000-0000-00000000000b' $$, 'admin: ve las propuestas de todos');
select isnt_empty($$ select 1 from public.feedback $$, 'admin: lee los comentarios');
select lives_ok($$ update public.catalog set status = 'approved' where id = 'b0000000-0000-0000-0000-00000000000b' $$, 'admin: aprueba libros');

-- ---------- Comprobación final ----------
reset role;
select is((select title from public.catalog where id = 'b0000000-0000-0000-0000-00000000000a'), '[Test] Aprobado',
  'el libro aprobado sigue intacto tras los intentos del usuario');
select is((select value from public.app_settings where key = 'donations_enabled'), 'true'::jsonb,
  'el ajuste sigue intacto tras el intento del usuario');
select isnt_empty($$ select 1 from public.catalog_history where catalog_id = 'b0000000-0000-0000-0000-00000000000b' and op = 'update'
  and changed_by = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$, 'el historial registra la aprobación del admin');
select hasnt_column('public', 'catalog', 'locked_fields', 'sin CSV no hace falta proteger campos (locked_fields retirado)');

select * from finish();
rollback;
