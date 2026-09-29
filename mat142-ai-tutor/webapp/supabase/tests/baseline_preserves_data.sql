do $$
begin
  if not exists (
    select 1
    from public.allowed_students
    where email = 'migration-fixture@example.test'
      and display_name = 'Migration Fixture'
  ) then
    raise exception 'migration removed or changed historical student list data';
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

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'allowed_students'
      and policyname = 'faculty read pilot allowlist'
  ) then
    raise exception 'the historical student list must not have a faculty read policy';
  end if;

  if not exists (
    select 1 from pg_proc
    where oid = 'public.has_active_student_enrollment()'::regprocedure
      and pg_get_functiondef(oid) ilike '%auth.identities%'
      and pg_get_functiondef(oid) ilike '%amr%'
      and pg_get_functiondef(oid) not ilike '%allowed_students%'
  ) then
    raise exception 'student RLS must require a Google OAuth identity without the old list';
  end if;
end
$$;
