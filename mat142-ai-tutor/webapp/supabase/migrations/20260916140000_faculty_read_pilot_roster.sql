-- The dashboard includes invited students who have not signed in yet.
-- Only provisioned faculty may read the pilot allowlist.
drop policy if exists "faculty read pilot allowlist" on public.allowed_students;
create policy "faculty read pilot allowlist" on public.allowed_students
  for select using (public.is_faculty());
