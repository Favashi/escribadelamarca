-- Estadísticas: vistas agregadas (sin datos personales), lector de Looker Studio limitado y panel de Admin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@test.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@test.local');
update public.profiles set is_admin = true where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

create function public._test_login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;

-- Ninguna vista de analytics expone datos personales
select is_empty($$ select 1 from information_schema.columns where table_schema = 'analytics'
  and column_name in ('email', 'user_id', 'id', 'display_name', 'avatar_url', 'user_agent', 'message') $$,
  'las vistas de analytics no tienen columnas con datos personales');

-- Lector de Looker Studio (se comprueban sus permisos: el entorno de tests no puede cambiar a ese rol)
select ok(has_table_privilege('looker_reader', 'analytics.uso_diario', 'select'), 'looker_reader lee analytics.uso_diario');
select ok(has_table_privilege('looker_reader', 'analytics.canales_diario', 'select') and has_table_privilege('looker_reader', 'analytics.libros', 'select')
  and has_table_privilege('looker_reader', 'analytics.retencion_semanal', 'select') and has_table_privilege('looker_reader', 'analytics.salud_diaria', 'select')
  and has_table_privilege('looker_reader', 'analytics.resumen', 'select'), 'looker_reader lee todas las vistas');
select ok(not has_table_privilege('looker_reader', 'public.profiles', 'select'), 'looker_reader NO lee perfiles');
select ok(not has_table_privilege('looker_reader', 'public.events', 'select'), 'looker_reader NO lee eventos');
select ok(not has_table_privilege('looker_reader', 'auth.users', 'select'), 'looker_reader NO lee cuentas');
select ok(not has_table_privilege('looker_reader', 'public.client_errors', 'select'), 'looker_reader NO lee errores con su detalle');

-- Visitantes y usuarios de la app no ven el esquema analytics
select ok(not has_schema_privilege('anon', 'analytics', 'usage') and not has_schema_privilege('authenticated', 'analytics', 'usage'),
  'la app (anon/authenticated) no tiene acceso a analytics');

-- Panel de Admin
select public._test_login('11111111-1111-1111-1111-111111111111');
select throws_ok($$ select public.admin_stats(30) $$, '42501', null, 'usuario: admin_stats rechazado');
select public._test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(jsonb_array_length(public.admin_stats(30) -> 'daily'), 30, 'admin: serie diaria del periodo (30 días)');
select ok(public.admin_stats(7) ?& array['current', 'previous', 'channels', 'retention', 'top', 'health', 'summary'],
  'admin: incluye comparación, canales, retención, top, salud y resumen');

select * from finish();
rollback;
