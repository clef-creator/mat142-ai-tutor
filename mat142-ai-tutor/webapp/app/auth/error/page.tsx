import Link from 'next/link';
import Header from '@/components/Header';

const REASONS: Record<string, string> = {
  'missing-code': 'That link was incomplete. Please request a new one.',
  expired: 'That link has already been used, or it expired. Sign-in links last one hour and work once.',
  domain: 'Only Ahmedabad University addresses can be used to sign in.',
  'not-on-list': 'That address is not on the pilot list. If you think it should be, contact your instructor.',
};

export default async function AuthError({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message = REASONS[reason ?? ''] ?? 'Something went wrong signing you in.';

  return (
    <>
      <Header />
      <div className="signin-wrap">
        <div className="signin">
          <h1>Couldn&rsquo;t sign you in</h1>
          <p className="lede">{message}</p>
          <Link className="btn" href="/" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Try again
          </Link>
        </div>
      </div>
    </>
  );
}
