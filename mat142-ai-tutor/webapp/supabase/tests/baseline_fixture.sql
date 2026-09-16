insert into public.allowed_students (email, display_name)
values ('migration-fixture@example.test', 'Migration Fixture')
on conflict (email) do update
set display_name = excluded.display_name;
