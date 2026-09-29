-- Student access now follows a verified university Google sign-in. Keep the
-- former roster table for historical data, but stop using it to grant access.
drop policy if exists "faculty read pilot allowlist" on public.allowed_students;

create or replace function public.has_active_student_enrollment()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.students st
    join auth.identities google_identity on google_identity.user_id = st.id
    where st.id = auth.uid()
      and lower(st.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and lower(st.email) like '%@ahduni.edu.in'
      and google_identity.provider = 'google'
      and lower(google_identity.identity_data ->> 'email') = lower(st.email)
      and google_identity.identity_data ->> 'email_verified' = 'true'
      and (
        coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method":"oauth"}]'::jsonb
        or coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '["oauth"]'::jsonb
      )
  )
$$;
