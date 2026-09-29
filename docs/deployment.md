# Deployment and database migrations

Vercel runs the Next.js application and API routes; Supabase supplies Auth and PostgreSQL. The Vercel Root Directory is `mat142-ai-tutor/webapp`.

## Database workflow

The Supabase CLI is pinned in `webapp/package.json`. Run commands from `mat142-ai-tutor/webapp`.

- `supabase/schema.sql` describes the current schema.
- `supabase/migrations/` contains ordered changes.

For local verification, run `npm run db:start`, `npm run db:verify`, and `npm run check`. `db:reset` destroys the local Docker database; do not run it against a linked project.

For a hosted Supabase project, back up data, check migration history with `npx supabase migration list`, preview with `npx supabase db push --dry-run`, then apply with `npx supabase db push`. Confirm row counts and policies after applying. Test on staging first when available.

**Apply `20260929120000_university_google_students.sql` before deploying the corresponding Vercel build.** It removes faculty read access to the old student list and updates the student RLS rule to require a verified `@ahduni.edu.in` Google OAuth session. The old `allowed_students` table and its data remain in place but no longer grant access. If the migration is not applied, direct database reads will still use the old access rule.

## Vercel environment

Account mode requires `ANTHROPIC_API_KEY`, `TUTOR_MODEL`, `SUMMARY_MODEL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `ALLOWED_EMAIL_DOMAIN=ahduni.edu.in`, `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN=ahduni.edu.in`, and `NEXT_PUBLIC_GOOGLE_SIGN_IN=on`. The service-role and Anthropic keys are server-only. `MAX_TURNS_PER_SESSION` and `MAX_SESSIONS_PER_DAY` may be set to positive integers.

`STUDENT_SETUP_TOKEN` is obsolete; remove it. Student accounts are created automatically at first Google sign-in. No list upload or password handout is needed.

Validate without printing secrets using `npm run validate:config -- .env.local`. The validator requires the configured domain to match the fixed database policy.

## Google and Supabase Auth

In Google Cloud Console, create a Web application OAuth client. Its authorized redirect URI is the Supabase provider callback displayed in Supabase, `https://<project-ref>.supabase.co/auth/v1/callback`. In Supabase, enable the Google provider and enter the client ID and secret. Under **Authentication → URL Configuration**, set Site URL to the deployed origin and add `<origin>/auth/callback` to Redirect URLs. Add local or preview callback URLs only if those deployments need sign-in.

A verified university Google account can then enter the tutor. Password-only university accounts cannot use student routes or student RLS policies. If Supabase Email signups remain enabled, use email confirmation to avoid unverified password accounts occupying a university address.

## Professor access

The professor's password sign-in remains available. Create a confirmed university-address Auth user in Supabase, then provision a matching faculty row as an administrator:

```sql
insert into public.faculty (id, email, full_name)
values ('<auth-user-uuid>', 'professor@ahduni.edu.in', 'Professor Name')
on conflict (id) do update
  set email = excluded.email, full_name = excluded.full_name;
```

The `faculty` row grants dashboard access; deleting it revokes access. Faculty cannot read student transcripts. The historical `allowed_faculty` table is not used for authorization.

## Release order

1. Back up the Supabase project and apply the reviewed migration.
2. Confirm the Google provider and redirect settings.
3. Deploy the Vercel build with `NEXT_PUBLIC_GOOGLE_SIGN_IN=on`.
4. Test with one verified `@ahduni.edu.in` Google account that was never on the old list. Check tutor start/chat/end and the faculty dashboard.

If application verification fails, roll Vercel back to a compatible build. Fix database problems with a forward migration.

References: [Supabase migration workflow](https://supabase.com/docs/guides/local-development/cli-workflows) and [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
