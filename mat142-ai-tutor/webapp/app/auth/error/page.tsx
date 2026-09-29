import Link from 'next/link';
import Header from '@/components/Header';
import { safeOAuthCode } from '@/lib/oauth-error';

const REASONS: Record<string, string> = {
  'missing-code': 'That link was incomplete. Please request a new one.',
  expired: 'Your sign-in session expired. Please try again.',
  domain: 'Only Ahmedabad University accounts can be used to sign in. If Google picked a personal account, try again and choose your university one.',
  google: 'Google sign-in did not finish. If you pressed cancel, just try again. If Google said access is blocked, tell your instructor.',
  'google-email': 'Supabase could not read your university email from Google. Please try again; if this continues, tell your instructor that Google email access needs checking.',
  'google-exchange': 'Supabase could not finish the Google sign-in exchange. Ask the site administrator to check the Google client credentials in Supabase.',
  'google-signups': 'New sign-ins are disabled in Supabase. Ask the site administrator to check the Auth signup setting.',
  'google-database': 'Supabase could not save the sign-in. Ask the site administrator to check the Auth logs.',
  'google-required': 'Use your Ahmedabad University Google account to sign in.',
  'student-access-denied': 'Sign in with your Ahmedabad University Google account to use the tutor.',
  'admin-access': 'You do not have access to view the dashboard.',
  provisioning: 'Your account could not be set up just now. Please try again or contact your instructor.',
};

export default async function AuthError({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; provider?: string; code?: string }>;
}) {
  const { reason, provider, code } = await searchParams;
  const providerError = safeOAuthCode(provider);
  const providerCode = safeOAuthCode(code);
  const message = REASONS[reason ?? ''] ?? 'Something went wrong signing you in.';

  return (
    <>
      <Header />
      <div className="signin-wrap">
        <div className="signin">
          <h1>Couldn&rsquo;t sign you in</h1>
          <p className="lede">{message}</p>
          {providerError || providerCode ? (
            <p className="footnote" style={{ marginTop: -8, marginBottom: 18 }}>
              Error code for support: <code>{[providerError, providerCode].filter(Boolean).join(' / ')}</code>
            </p>
          ) : null}
          <Link className="btn" href="/" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Try again
          </Link>
        </div>
      </div>
    </>
  );
}
