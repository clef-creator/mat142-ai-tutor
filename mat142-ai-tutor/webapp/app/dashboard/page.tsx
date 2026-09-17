import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { findActiveFaculty } from '@/lib/faculty';
import { isSoloMode } from '@/lib/mode';
import Header from '@/components/Header';
import { buildDashboard } from '@/lib/dashboard';
import { loadDashboardRows } from '@/lib/dashboard-data';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  if (isSoloMode()) redirect('/');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const faculty = await findActiveFaculty(createAdminClient(), user);
  if (!faculty) redirect('/auth/error?reason=not-on-list');

  let dashboard;
  try {
    const { allowedStudents, students, progress, sessions } = await loadDashboardRows(supabase);
    dashboard = buildDashboard(allowedStudents, students, progress, sessions);
  } catch (error) {
    console.error('[dashboard] could not load authorized signals', error);
    return (
      <>
        <Header email={faculty.email} subtitle="Professor dashboard" />
        <main className="shell">
          <div className="panel panel-b" role="alert">
            <h1>Dashboard unavailable</h1>
            <p>Student signals could not be loaded. Please try again in a moment.</p>
            <a href="/dashboard">Retry</a>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header email={faculty.email} subtitle="Professor dashboard" />
      <DashboardClient data={dashboard} />
    </>
  );
}
