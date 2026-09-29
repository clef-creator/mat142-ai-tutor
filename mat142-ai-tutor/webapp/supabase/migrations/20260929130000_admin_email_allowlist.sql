-- Dashboard access follows an administrator-managed email allowlist.
-- The JWT email is signed by Supabase Auth; a student cannot set it through
-- a request body or user metadata. The application also checks this table on
-- every dashboard request before querying faculty-visible signals.
insert into public.allowed_faculty (email)
values ('suryaraj.j@ahduni.edu.in')
on conflict (email) do nothing;

create or replace function public.is_faculty()
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.allowed_faculty f
    where lower(f.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;
