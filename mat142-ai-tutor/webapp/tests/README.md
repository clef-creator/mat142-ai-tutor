# Tests

Run `npm test` from `mat142-ai-tutor/webapp`. The scripts bundle with esbuild and print `ok` or `FAIL`.

The unit checks cover curriculum selection, rendering, solo mode, conversation ordering, university Google authorization, faculty access, dashboard aggregates, deployment configuration, and failure handling. `test:enrollment` checks that a university password session cannot start or continue tutor work even with an existing session. `test:google-callback` checks first Google sign-in without a student list, plus rejected outside-domain, unverified, and password sessions.

The database integration checks require the disposable local Supabase CLI project. Run `npm run db:start`, `npm run db:reset`, `npm run test:chat-turns:integration`, and `npm run test:account:integration`. The account integration check confirms that a password-only university Auth account cannot bypass student RLS, even if the historical `allowed_students` table contains that email. A full Google OAuth callback cannot be exercised by the local password-based test harness; verify it against a staging Supabase project before release.

Run `npm run check` for typecheck, unit tests, and production build. Run `npm run db:verify` to replay and lint migrations locally.
