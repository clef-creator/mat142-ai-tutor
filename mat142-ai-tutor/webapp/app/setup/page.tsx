import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import { isSoloMode } from '@/lib/mode';
import { setupEnabled } from '@/lib/setup-token';
import SetupClient from './SetupClient';

export const dynamic = 'force-dynamic';

// Nothing here should ever appear in a search result.
export const metadata = { robots: { index: false, follow: false } };

/**
 * The page that creates the student sign-ins.
 *
 * It is not linked from anywhere. It is reached by typing the address, and it
 * returns an ordinary "page not found" unless a setup token is configured —
 * so once the accounts exist, clearing one setting removes the page entirely.
 */
export default async function SetupPage() {
  if (isSoloMode() || !setupEnabled()) notFound();

  const domain = (process.env.ALLOWED_EMAIL_DOMAIN ?? 'ahduni.edu.in').toLowerCase();

  return (
    <>
      <Header subtitle="Setting up student sign-ins" />
      <SetupClient domain={domain} />
    </>
  );
}
