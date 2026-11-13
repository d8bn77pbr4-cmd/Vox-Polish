-- Garderobe: Tabellen, Zugriffsregeln, Einladungen, Bild-Speicher

create schema if not exists private;
grant usage on schema private to authenticated, supabase_auth_admin;

create table public.invites (
  email text primary key check (email = lower(email)),
  is_admin boolean not null default false,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  measurements jsonb not null default '{}'::jsonb,
  skin_tone text not null default '#e6c3a5',
  place_name text,
  lat double precision,
  lon double precision,
  created_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  image_path text not null,
  thumb_path text not null,
  aspect real not null default 1,
  name text not null default '',
  category text not null check (category in ('top','bottom','dress','outerwear','shoes','accessory')),
  subcategory text not null default '',
  length text check (length in ('short','mid','long')),
  accessory_type text check (accessory_type in ('hat','bag','scarf','belt','glasses','jewelry','other')),
  colors jsonb not null default '[]'::jsonb,
  pattern text not null default 'uni',
  material text not null default '',
  warmth smallint not null default 3 check (warmth between 1 and 5),
  formality smallint not null default 2 check (formality between 1 and 5),
  seasons text[] not null default '{spring,summer,autumn,winter}',
  tags text[] not null default '{}',
  price numeric(10,2),
  is_wishlist boolean not null default false,
  created_at timestamptz not null default now()
);
create index items_user_idx on public.items (user_id, created_at desc);

create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  item_ids uuid[] not null,
  source text not null default 'manual' check (source in ('daily','manual','doll')),
  rating smallint not null default 0 check (rating between -1 and 1),
  worn boolean not null default false,
  adjust jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index outfits_user_idx on public.outfits (user_id, date desc);

create table public.analysis_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);

-- Wer ist Admin? Steht in invites, das normale Nutzer nicht ändern können.
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.invites i
    where i.email = lower((select auth.jwt() ->> 'email')) and i.is_admin
  );
$$;
revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

alter table public.invites enable row level security;
alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.outfits enable row level security;
alter table public.analysis_usage enable row level security;

create policy invites_admin_select on public.invites for select to authenticated
  using ((select private.is_admin()));
create policy invites_admin_insert on public.invites for insert to authenticated
  with check ((select private.is_admin()) and is_admin = false);
create policy invites_admin_delete on public.invites for delete to authenticated
  using ((select private.is_admin()) and is_admin = false);

create policy profiles_own_select on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy profiles_own_update on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy items_own on public.items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy outfits_own on public.outfits for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy usage_own_select on public.analysis_usage for select to authenticated
  using ((select auth.uid()) = user_id);

-- Zähler für die Fotoanalyse; nur die Edge Function (service_role) darf ihn erhöhen.
create function public.bump_usage(uid uuid, lim int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare c int;
begin
  insert into public.analysis_usage (user_id, day, count) values (uid, current_date, 1)
  on conflict (user_id, day) do update set count = public.analysis_usage.count + 1
    where public.analysis_usage.count < lim
  returning count into c;
  return c is not null;
end $$;
revoke execute on function public.bump_usage(uuid, int) from public, anon, authenticated;
grant execute on function public.bump_usage(uuid, int) to service_role;

-- Konten nur für eingeladene E-Mails.
create function private.check_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null
     and exists (select 1 from public.invites where email = lower(new.email)) then
    return new;
  end if;
  raise exception 'not_invited';
end $$;
revoke execute on function private.check_invite() from public;
grant execute on function private.check_invite() to supabase_auth_admin;
create trigger garderobe_check_invite before insert on auth.users
  for each row execute function private.check_invite();

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end $$;
revoke execute on function private.handle_new_user() from public;
grant execute on function private.handle_new_user() to supabase_auth_admin;
create trigger garderobe_new_user after insert on auth.users
  for each row execute function private.handle_new_user();

-- Privater Bild-Speicher, ein Ordner pro Person.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('items', 'items', false, 3145728, array['image/webp','image/png','image/jpeg']);

create policy items_files_select on storage.objects for select to authenticated
  using (bucket_id = 'items' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy items_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'items' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy items_files_update on storage.objects for update to authenticated
  using (bucket_id = 'items' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy items_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'items' and (storage.foldername(name))[1] = (select auth.uid())::text);
