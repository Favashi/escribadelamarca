-- =============================================================
-- Comentarios de los usuarios (fase de pruebas): se envían desde Perfil, llegan por Telegram
-- y el admin los gestiona en Admin → Comentarios.
-- =============================================================

create table if not exists public.feedback (
  id           bigserial primary key,
  user_id      uuid default auth.uid() references auth.users(id) on delete set null,
  kind         text not null default 'idea' check (kind in ('fallo', 'idea', 'otro')),
  message      text not null check (char_length(message) between 3 and 2000),
  page         text check (char_length(page) <= 100),        -- pantalla desde la que se envía
  app_version  text check (char_length(app_version) <= 20),
  user_agent   text check (char_length(user_agent) <= 300),
  status       text not null default 'new' check (status in ('new', 'read', 'done')),
  created_at   timestamptz not null default now()
);
create index if not exists feedback_status_idx on public.feedback (status, created_at desc);

grant insert on public.feedback to authenticated;
grant usage on sequence public.feedback_id_seq to authenticated;
grant select, update, delete on public.feedback to authenticated;   -- RLS: solo admin
grant all on public.feedback to service_role;
alter table public.feedback enable row level security;

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'new');
drop policy if exists feedback_admin_select on public.feedback;
create policy feedback_admin_select on public.feedback for select to authenticated
  using ((select public.is_admin()));
drop policy if exists feedback_admin_update on public.feedback;
create policy feedback_admin_update on public.feedback for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists feedback_admin_delete on public.feedback;
create policy feedback_admin_delete on public.feedback for delete to authenticated
  using ((select public.is_admin()));

create or replace function public.notify_new_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
begin
  select display_name into who from public.profiles where id = new.user_id;
  perform public.notify_admin(
    case new.kind when 'fallo' then '🐞 Fallo' when 'idea' then '💡 Idea' else '💬 Comentario' end
    || ' de ' || coalesce(who, 'un usuario') || coalesce(' (' || new.page || ')', '') || E':\n' || left(new.message, 1500)
    || E'\nVer en Admin → Comentarios.');
  return new;
end;
$$;
revoke execute on function public.notify_new_feedback() from public, anon, authenticated;

drop trigger if exists notify_new_feedback on public.feedback;
create trigger notify_new_feedback after insert on public.feedback
  for each row execute function public.notify_new_feedback();
