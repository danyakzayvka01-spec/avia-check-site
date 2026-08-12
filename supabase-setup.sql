-- Run this script once in Supabase: SQL Editor → New query.
-- It creates shared ticket data, administrator access, and protected photo storage.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Zа-яА-ЯёЁ0-9_-]{3,30}$'),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique check (ticket_number ~ '^[0-9]{6,20}$'),
  image_path text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

alter table public.profiles enable row level security;
alter table public.tickets enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.tickets to anon, authenticated;
grant select on public.profiles to authenticated;
grant insert on public.tickets to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "Users can see their own profile" on public.profiles;
create policy "Users can see their own profile"
on public.profiles for select to authenticated
using (id = auth.uid());

drop policy if exists "Anyone can check ticket numbers" on public.tickets;
create policy "Anyone can check ticket numbers"
on public.tickets for select to anon, authenticated
using (true);

drop policy if exists "Only administrators can add tickets" on public.tickets;
create policy "Only administrators can add tickets"
on public.tickets for insert to authenticated
with check (public.is_admin() and created_by = auth.uid());

insert into storage.buckets (id, name, public)
values ('ticket-images', 'ticket-images', false)
on conflict (id) do update set public = false;

drop policy if exists "Anyone can request ticket photos" on storage.objects;
create policy "Anyone can request ticket photos"
on storage.objects for select to anon, authenticated
using (bucket_id = 'ticket-images');

drop policy if exists "Only administrators can upload ticket photos" on storage.objects;
create policy "Only administrators can upload ticket photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'ticket-images' and public.is_admin());

-- After registering the account `trust` with password `1488` on the website,
-- run this command once to grant it administrator rights:
-- update public.profiles set is_admin = true where username = 'trust';
