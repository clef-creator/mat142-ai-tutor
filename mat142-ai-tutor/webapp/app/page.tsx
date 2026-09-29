import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { findActiveStudentEnrollment } from '@/lib/enrollment';
import { googleSignInEnabled, isSoloMode, soloModeReady } from '@/lib/mode';
import { ACCESS_COOKIE, hasAccess } from '@/lib/access';
import Header from '@/components/Header';
import EntryChoice from './EntryChoice';
import AccessForm from './AccessForm';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (isSoloMode()) return <SoloHome />;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let studentReady = false;
  if (user) {
    const admin = createAdminClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    studentReady = Boolean(await findActiveStudentEnrollment(admin, user, claimsData?.claims));
  }

  return (
    <>
      <Header email={user?.email} />
      <div className="signin-wrap">
        <div>
          <EntryChoice signedIn={Boolean(user)} studentReady={studentReady}
            googleEnabled={googleSignInEnabled()} />
          <p className="footnote">
            Calcu-Buddy remembers what you have worked on so it can pick up where you left
            off, which means your conversations are saved. Your teaching team can see which
            topics you have practised and where you got stuck &mdash; they cannot read what
            you typed.
          </p>
        </div>
      </div>
    </>
  );
}

async function SoloHome() {
  // Refusing to open the door at all is the right response to a missing code:
  // the alternative is a tutor anyone who finds the address can spend money on.
  if (!soloModeReady()) {
    return (
      <>
        <Header />
        <div className="signin-wrap">
          <div className="signin">
            <h1>Not set up yet</h1>
            <p className="lede">
              This site is running without an access code, so it is not letting anyone in.
              Add an <code>ACCESS_CODE</code> setting of at least four characters and
              redeploy.
            </p>
          </div>
        </div>
      </>
    );
  }

  const jar = await cookies();
  if (await hasAccess(jar.get(ACCESS_COOKIE)?.value)) redirect('/tutor');

  return (
    <>
      <Header />
      <div className="signin-wrap">
        <div>
          <div className="signin">
            <h1>Calcu-Buddy</h1>
            <p className="lede">
              A calculus tutor for MAT142. Enter the code you were given and it will start
              you on a topic.
            </p>
            <AccessForm />
          </div>
          <p className="footnote">
            This is an early version being tried out. Your progress and conversations are
            kept in this browser rather than on a server, so nobody at the university can
            see them &mdash; and clearing your browser data clears them too. What you type
            is sent to Anthropic to produce each reply, as with any AI assistant, but it is
            not saved here afterwards.
          </p>
        </div>
      </div>
    </>
  );
}
