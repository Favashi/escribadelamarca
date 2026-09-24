-- =============================================================
-- Interruptor «feedback_enabled» (Admin → Ajustes → Comentarios desde la app).
-- Desactivado: la app enlaza a los issues de GitHub y la base de datos rechaza comentarios nuevos.
-- =============================================================

insert into public.app_settings (key, value) values ('feedback_enabled', 'true'::jsonb)
on conflict (key) do nothing;

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'new'
              and (select public.setting_enabled('feedback_enabled')));
