import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { pickTopic, choiceForTopic } from '@/lib/picker';
import { topics } from '@/lib/curriculum';
import { isSoloMode, soloModeReady } from '@/lib/mode';
import { ACCESS_COOKIE, NAME_COOKIE, hasAccess } from '@/lib/access';
import Header from '@/components/Header';
import TutorClient from './TutorClient';
import SoloTutorClient from './SoloTutorClient';
import type { ChatMessage, ProgressRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function TutorPage() {
  if (isSoloMode()) return <SoloTutorPage />;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const admin = createAdminClient();

  const { data: student } = await admin
    .from('students')
    .select('display_name, email')
    .eq('id', user.id)
    .maybeSingle();

  const { data: progressRows } = await admin
    .from('progress')
    .select('*')
    .eq('student_id', user.id);
  const progress = (progressRows ?? []) as ProgressRow[];

  // Resume an open session if there is one, otherwise show what is next.
  const { data: open } = await admin
    .from('sessions')
    .select('id, topic_id, turn_count')
    .eq('student_id', user.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let existingMessages: ChatMessage[] = [];
  if (open) {
    const { data: msgs } = await admin
      .from('messages')
      .select('role, content')
      .eq('session_id', open.id)
      .order('id', { ascending: true });
    existingMessages = (msgs ?? []) as ChatMessage[];
  }

  const { count: sessionCount } = await admin
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', user.id);

  const choice = open ? choiceForTopic(open.topic_id, progress) : pickTopic(progress);
  const activeTopic = choice.topic;

  const statusMap: Record<string, string> = {};
  progress.forEach((p) => { statusMap[p.topic_id] = p.status; });

  const email = student?.email ?? user.email ?? '';
  const name = student?.display_name ?? email.split('@')[0];

  return (
    <>
      <Header email={email} />
      <div className="shell">
        <TutorClient
          studentName={name}
          initials={name.slice(0, 2).toUpperCase()}
          sessionCount={sessionCount ?? 0}
          existingSessionId={open?.id ?? null}
          existingMessages={existingMessages}
          topic={{
            id: activeTopic.id,
            title: activeTopic.title,
            studentFacingName: activeTopic.student_facing_name,
            unit: activeTopic.unit_title,
          }}
          because={choice.because}
          topicList={topics.map((t) => ({
            id: t.id,
            name: t.student_facing_name,
            status: statusMap[t.id] ?? 'not_started',
          }))}
        />
        <p className="privacy-note">
          Calcu-Buddy remembers what you have worked on so it can pick up where you left off,
          which means these conversations are saved. Your teaching team can see which topics
          you have practised and where you got stuck &mdash; they cannot read what you typed.
        </p>
      </div>
    </>
  );
}

/**
 * The tutor screen without a database behind it.
 *
 * All this page does is check the code was entered and hand over to the
 * browser, which holds the progress. Everything after that is the same
 * component the signed-in version uses.
 */
async function SoloTutorPage() {
  if (!soloModeReady()) redirect('/');

  const jar = await cookies();
  if (!(await hasAccess(jar.get(ACCESS_COOKIE)?.value))) redirect('/');

  const name = jar.get(NAME_COOKIE)?.value?.trim() || null;

  return (
    <>
      <Header />
      <SoloTutorClient initialName={name} />
      <div className="shell">
        <p className="privacy-note">
          Your progress is kept in this browser, not on a server. Clearing your browser data
          clears it. What you type is sent to Anthropic to produce each reply, as with any AI
          assistant, but it is not saved here afterwards.
        </p>
      </div>
    </>
  );
}
