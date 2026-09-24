-- Portadas: bucket público «covers» en Storage; solo el admin sube, cambia o borra.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@test.local');
update public.profiles set is_admin = true where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

create function public._test_login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
create function public._test_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role": "anon"}', true), set_config('role', 'anon', true);
$$;

select ok((select public from storage.buckets where id = 'covers'), 'el bucket «covers» existe y es público (se ven por URL)');
select ok((select file_size_limit <= 1048576 from storage.buckets where id = 'covers'), 'tamaño máximo por portada: 1 MB');

select public._test_anon();
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('covers', 'anonimo.webp') $$,
  '42501', null, 'sin sesión: no puede subir portadas');

select public._test_login('11111111-1111-1111-1111-111111111111');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('covers', 'usuario.webp') $$,
  '42501', null, 'usuario: no puede subir portadas');

select public._test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('covers', 'admin.webp') $$, 'admin: sube portadas');

-- Borrar solo se puede con la API de Storage (Supabase bloquea el DELETE directo): se comprueba la política,
-- y el borrado real lo prueba tests/e2e (quitar portada y «Borrar todas»).
reset role;
select ok(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and policyname = 'covers_admin_delete' and cmd = 'DELETE' and qual like '%is_admin%'), 'borrar portadas exige ser admin');
select ok(not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and qual like '%covers%' and roles::text like '%anon%'), 'ninguna política de portadas para visitantes sin sesión');

select * from finish();
rollback;
