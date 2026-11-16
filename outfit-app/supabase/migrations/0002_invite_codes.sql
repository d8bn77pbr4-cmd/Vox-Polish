-- Einladungs-Code: verhindert, dass jemand, der nur die E-Mail kennt, das Konto wegschnappt.
alter table public.invites
  add column code text not null default encode(extensions.gen_random_bytes(6), 'hex');

-- Das allererste Konto darf sich frei anlegen und wird Admin (nur über die Edge Function).
create function public.claim_first_invite(p_email text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(471100);
  if exists (select 1 from public.invites) then
    return false;
  end if;
  insert into public.invites (email, is_admin) values (lower(p_email), true);
  return true;
end $$;
revoke execute on function public.claim_first_invite(text) from public, anon, authenticated;
grant execute on function public.claim_first_invite(text) to service_role;
