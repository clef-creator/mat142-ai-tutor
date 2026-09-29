import Link from 'next/link';
import Header from '@/components/Header';

const REASONS: Record<string, string> = {
  'missing-code': 'That link was incomplete. Please request a new one.',
  expired: 'Your sign-in session expired. Please try again.',
  domain: 'Only Ahmedabad University accounts can be used to sign in. If Google picked a personal account, try again and choose your university one.',
  google: 'Google sign-in did not finish. If you pressed cancel, just try again. If Google said access is blocked, tell your instructor.',
  'google-required': 'Use your Ahmedabad University Google account to sign in.',
  'student-access-denied': 'Sign in with your Ahmedabad University Google account to use the tutor.',
  provisioning: 'Your account could not be set up just now. Please try again or contact your instructor.',
};

export default async function AuthError({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; detail?: string }>;
}) {
  const { reason, detail } = await searchParams;
  // Shown as plain text. The callback has already stripped it to letters,
  // digits and punctuation, and React escapes it again here.
  const shownDetail = detail ? detail.slice(0, 200) : null;
  const message = REASONS[reason ?? ''] ?? 'Something went wrong signing you in.';

  return (
    <>
      <Header />
      <div className="signin-wrap">
        <div className="signin">
          <h1>Couldn&rsquo;t sign you in</h1>
          <p className="lede">{message}</p>
          {shownDetail ? (
            <p className="footnote" style={{ marginTop: -8, marginBottom: 18 }}>
              Details for whoever looks after the site: <code>{shownDetail}</code>
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
