-- =============================================================
-- Donaciones: de Ko-fi a Buy Me a Coffee.
-- kofi_payments → donations (tabla genérica por proveedor).
-- =============================================================

alter table public.kofi_payments rename to donations;
alter table public.donations rename column kofi_tx_id to external_id;
alter table public.donations add column if not exists provider text not null default 'bmc';
alter table public.donations add column if not exists live_mode boolean;
alter table public.donations alter column provider set default 'bmc';

-- El perfil nuevo comprueba si ese email ya había donado antes de registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  paid boolean;
begin
  select exists (
    select 1 from public.donations
    where lower(new.email) = any(emails)
      and amount >= public.supporter_min_amount()
      and coalesce(live_mode, true)
  ) into paid;

  insert into public.profiles (id, email, display_name, avatar_url, is_supporter, supporter_since)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    paid,
    case when paid then now() end
  )
  on conflict (id) do nothing;

  if paid then
    update public.donations set matched = true where lower(new.email) = any(emails);
  end if;
  return new;
end;
$$;
