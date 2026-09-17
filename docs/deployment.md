# Deployment and database migrations

The accepted runtime split is documented in
[ADR 0001](architecture/0001-api-runtime.md): Vercel runs the Next.js pages and
route handlers; Supabase provides Auth and PostgreSQL. Enabling Supabase does
not deploy or move any API code to Edge Functions.

No production project configuration was inspected while writing this runbook.
Verify every setting against the intended Vercel and Supabase projects before
promoting a release.

## Versioned database workflow

The Supabase CLI is pinned in `webapp/package.json`. Run commands from
`mat142-ai-tutor/webapp` so every contributor and CI uses the same CLI version.

- `supabase/schema.sql` is the declarative description of the agreed schema.
- `supabase/migrations/` is the ordered deployment history.
- `supabase/config.toml` reproduces the local Auth/Postgres setup.

For each schema change:

1. Edit `supabase/schema.sql`.
2. Start the local database with `npm run db:start`.
3. Generate a migration with `npx supabase db diff -f <short_name>`.
4. Review the generated SQL. Do not accept unexpected drops, transcript
   grants or destructive data changes.
5. Rebuild and reapply the baseline over fixture data with
   `npm run db:verify`, then run `npm run check`.
6. Commit the declarative schema and generated migration together.

`db:reset` is destructive to the local Docker database. It must never be run
with `--linked` against a shared or production project.

### Adopting an existing Supabase project

The baseline migration is intentionally idempotent and does not drop or
truncate application tables. It can create a fresh database or record the
checked-in schema in a project that previously ran `schema.sql` manually.

1. Confirm a restorable backup exists and record table row counts.
2. Test against a separate staging project first.
3. Run `npx supabase login`, then `npx supabase link --project-ref <project-ref>`.
4. Inspect local and remote history with `npx supabase migration list`.
5. Preview with `npx supabase db push --dry-run` and review every statement.
6. Apply with `npx supabase db push`.
7. Recheck row counts, student sign-in, active-enrollment revocation and the
   absence of any faculty policy on `public.messages`.

After adoption, make all remote schema changes through migrations. Dashboard
or SQL-editor changes bypass migration history and create drift.

## Vercel configuration

Set the Vercel Root Directory to `mat142-ai-tutor/webapp`. Application APIs are
the Next.js handlers under `app/api`; there are no Supabase Edge Functions to
deploy.

Before a deployment, run:

```bash
npm ci
npm run validate:config -- .env.local
npm run check
```

For Vercel, run `npm run validate:config` in an environment containing the
project variables. It reports variable names and validation failures but never
prints secret values.

Account mode requires:

- `ANTHROPIC_API_KEY`, `TUTOR_MODEL`, `SUMMARY_MODEL`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `NEXT_PUBLIC_SITE_URL`
- matching `ALLOWED_EMAIL_DOMAIN` and `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN`
- positive `MAX_TURNS_PER_SESSION` and `MAX_SESSIONS_PER_DAY`

`STUDENT_SETUP_TOKEN` is set only while accounts are being created, and must be
at least sixteen characters; the validator rejects a shorter one. See
[Creating student accounts](#creating-student-accounts).

Never prefix the Anthropic or service-role key with `NEXT_PUBLIC_`. Scope
`NEXT_PUBLIC_SITE_URL` to the production environment when preview deployments
must return to their own origins.

## Supabase Auth

Students sign in with their university address and a password issued to them.
`signInWithPassword` sends no mail, so **no SMTP provider, sending domain or DNS
record is required** for the pilot. Leave Supabase's default mail service alone
rather than configuring it.

In **Authentication → URL Configuration**, set Site URL to the exact production
origin. The `/auth/callback` route is retained and still works, so if emailed
links are ever enabled, also add the exact production callback
(`https://calcu-buddy.example.edu/auth/callback`), `http://localhost:3000/auth/callback`
for local development, and a narrowly scoped preview pattern only if preview
authentication is required. The app builds that callback from the browser's
current origin, so the origin must appear in the redirect allow-list.

Confirm **Authentication → Providers → Email** has the email provider enabled
and, since no mail can be delivered, that confirmations are not required for
sign-in. Accounts created by the setup page are marked confirmed server-side.

## Creating student accounts

Set `STUDENT_SETUP_TOKEN` in Vercel and redeploy. The site then serves one
additional page, `/setup`, which is unlinked and marked `noindex`. It accepts
the token, a pasted class list, and creates an Auth account per address with a
generated password, showing them once in a table to be copied and handed out.
Passwords are never logged and cannot be recovered; a student who loses one is
given a new one by pasting their address again with "give everyone a new
password" ticked.

The page is the only thing the token unlocks, and anyone holding it can create
sign-ins and read their passwords. It rejects addresses outside
`ALLOWED_EMAIL_DOMAIN`, caps a single run at sixty addresses, compares the token
in constant time and delays a wrong answer. Clear the variable and redeploy once
the cohort has signed in; the page then 404s and no account is affected.

Each address is written to `public.allowed_students` before its password is
issued, so a student is never handed a credential that authorization will
immediately reject. The `students` row is created at first sign-in, which is how
the dashboard distinguishes invited from started. Removing the allow-list entry
revokes subsequent tutor requests and direct student reads.

## Professor access

The professor signs in with the same form, but the role is granted only by a
trusted administrator and never by `/setup` — a professor must not appear in
`allowed_students`. In Supabase **Authentication → Users → Add user**, create
the professor's university address with a password and auto-confirm it. Copy its
Auth user UUID, then, using the SQL Editor as an administrator, provision that
exact identity:

```sql
insert into public.faculty (id, email, full_name)
values ('<auth-user-uuid>', 'professor@ahduni.edu.in', 'Professor Name')
on conflict (id) do update
  set email = excluded.email, full_name = excluded.full_name;
```

Replace the placeholders with the real Auth user and address. The Auth email,
faculty email and configured domain must match. `allowed_faculty` is a legacy
table and is not used for authorization. Sign-in sends the professor to
`/dashboard`, which checks
the faculty row again on every visit. Delete the `faculty` row to revoke access.
Only an administrator with privileged database access can grant this role; there is no
client-facing role assignment. The dashboard shows authorized learning signals
as described in [`dashboard.md`](dashboard.md). Faculty still have no access
to `public.messages`.

## Release and rollback order

1. Back up and apply reviewed database migrations.
2. Verify permissions and row counts.
3. Deploy the compatible Vercel build.
4. Exercise sign-in, session start, chat and session end with test accounts.
5. Create the student accounts, hand out the passwords, then clear
   `STUDENT_SETUP_TOKEN` and redeploy.

If application verification fails, roll Vercel back to the prior compatible
build. Correct database problems with a new forward migration; do not improvise
destructive rollback SQL on a database containing student data.

References: [Supabase migration workflow](https://supabase.com/docs/guides/local-development/cli-workflows),
[Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls),
and [Supabase password sign-in](https://supabase.com/docs/guides/auth/passwords).
