do $$
begin
  if not exists (
    select 1
    from public.allowed_students
    where email = 'migration-fixture@example.test'
      and display_name = 'Migration Fixture'
  ) then
    raise exception 'baseline migration removed or changed existing allow-list data';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and (
        policyname ilike '%faculty%'
        or coalesce(qual, '') ilike '%is_faculty%'
        or coalesce(with_check, '') ilike '%is_faculty%'
      )
  ) then
    raise exception 'faculty must not receive transcript access';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'allowed_students'
      and policyname = 'faculty read pilot allowlist'
      and coalesce(qual, '') ilike '%is_faculty%'
  ) then
    raise exception 'the dashboard roster requires a faculty-only allowlist read policy';
  end if;
end
$$;
