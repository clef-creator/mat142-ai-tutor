-- Faculty access follows a trusted faculty row and the current Auth email.
-- A changed Auth email must not retain access through the same user ID.
create or replace function public.is_faculty()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.faculty f
    where f.id = auth.uid()
      and lower(f.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;
