# Google sign-in

Students can sign in with their university Google account instead of a
password, so there is nothing to hand out and nothing to forget. It is off
until `NEXT_PUBLIC_GOOGLE_SIGN_IN` is set to `on` and the site is redeployed,
so this code can be merged before Google is configured.

## Turning it on

1. In Google Cloud Console, create an OAuth client of type **Web application**.
   Its **Authorized redirect URI** is the Supabase callback shown on the Google
   provider page in Supabase (`https://<project-ref>.supabase.co/auth/v1/callback`),
   not the site's own `/auth/callback`.
2. In Supabase **Authentication → Sign In / Providers → Google**, enable the
   provider and paste the client ID and secret.
3. In Supabase **Authentication → URL Configuration**, set Site URL to the
   production origin and add `<production origin>/auth/callback` to Redirect URLs.
4. In Vercel, add `NEXT_PUBLIC_GOOGLE_SIGN_IN=on` and redeploy. The name starts
   with `NEXT_PUBLIC_` because the browser reads it; it is not a secret.

## What changes and what does not

Authorization is unchanged. `/auth/callback` still rejects and signs out any
address outside `ALLOWED_EMAIL_DOMAIN`, sends faculty to `/dashboard`, and signs
out anyone not on `allowed_students`. Supabase links a Google sign-in to an
existing account with the same address, so students and the professor keep
their progress and role.

With the switch on, `/setup` adds students to the pilot list with a confirmed
account and no password, and shows no passwords. The password form stays under
"Sign in with a password instead" for the professor and as a fallback. A
plus-suffix address such as `name+student@` has no Google account of its own,
so it can only be used with a password.
