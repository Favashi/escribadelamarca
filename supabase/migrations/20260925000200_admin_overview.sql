-- =============================================================
-- Admin → Resumen: lo que hay que atender. Las cifras que la app no puede calcular por sí sola
-- (errores de la app, avisos de Telegram fallidos y tamaño de la base de datos). Las propuestas, comentarios,
-- portadas y códigos los cuenta la app con los datos que ya tiene; las métricas clave salen de admin_metrics.
-- =============================================================

create or replace function public.admin_overview()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'errors_7d', (select count(*) from public.client_errors where created_at > now() - interval '7 days'),
    'error_kinds_7d', (select count(distinct signature) from public.client_errors where created_at > now() - interval '7 days'),
    'notify_failed_7d', (select count(*) from public.admin_notifications where status = 'failed' and created_at > now() - interval '7 days'),
    'db_mb', round(pg_database_size(current_database()) / 1024.0 / 1024.0, 1),
    'db_limit_mb', 500
  );
end;
$$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
