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
end
$$;
