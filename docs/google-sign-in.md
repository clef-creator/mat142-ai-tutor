# Google sign-in

Students sign in with a verified Google account whose email ends in `@ahduni.edu.in`. No student list, invitation, setup token, or issued password is needed. The first successful sign-in creates their `students` row. Subsequent tutor requests and direct database reads require a Google OAuth session. A university-address password session is not sufficient.

The professor can still use the existing password sign-in. Professor access requires a matching `faculty` row provisioned by an administrator.

## Configuration

1. In Google Cloud Console, create an OAuth client of type **Web application**. Add the Supabase Google provider callback, `https://<project-ref>.supabase.co/auth/v1/callback`, to **Authorized redirect URIs**. Follow Google's instructions for Authorized JavaScript origins if required for your client.
2. In Supabase **Authentication → Sign In / Providers → Google**, enable Google and enter the client ID and secret.
3. In Supabase **Authentication → URL Configuration**, set Site URL to the deployed site origin and allow `<site origin>/auth/callback` as a Redirect URL.
4. Apply `webapp/supabase/migrations/20260929120000_university_google_students.sql` to the Supabase project before deploying this app version. It changes direct database access to the same Google-session rule.
5. In Vercel, set `ALLOWED_EMAIL_DOMAIN=ahduni.edu.in`, `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN=ahduni.edu.in`, and `NEXT_PUBLIC_GOOGLE_SIGN_IN=on`. Redeploy.

The old `allowed_students` table is retained as historical data, but the app no longer reads it or grants access from it. `STUDENT_SETUP_TOKEN` can be removed from Vercel.

If sign-in reaches `/auth/error`, inspect its `reason` query parameter. `domain` means the address is outside the university domain; `google-required` means the session did not prove a verified university Google identity; `provisioning` means creating the student row failed. Check Vercel logs for the last case.

Some Google Workspace accounts need the email OAuth scope requested explicitly. The app requests `https://www.googleapis.com/auth/userinfo.email`; a `google-email` error means Supabase still could not read the Google address. Check Supabase Authentication logs and the university's Google app access settings in that case.
