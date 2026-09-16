import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { findActiveFaculty } from '@/lib/faculty';
import { isSoloMode } from '@/lib/mode';
import Header from '@/components/Header';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  if (isSoloMode()) redirect('/');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const faculty = await findActiveFaculty(createAdminClient(), user);
  if (!faculty) redirect('/auth/error?reason=not-on-list');

  return (
    <>
      <Header email={faculty.email} subtitle="Professor dashboard" />
      <main className="signin-wrap">
        <div className="signin">
          <h1>Professor dashboard</h1>
          <p className="lede">You are signed in. Student learning signals will appear here when the dashboard is implemented.</p>
        </div>
      </main>
    </>
  );
}
