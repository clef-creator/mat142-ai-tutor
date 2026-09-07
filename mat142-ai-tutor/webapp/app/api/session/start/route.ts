import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { pickTopic } from '@/lib/picker';
import { isSoloMode } from '@/lib/mode';
import type { ProgressRow } from '@/lib/types';

export const runtime = 'nodejs';

const MAX_SESSIONS_PER_DAY = Number(process.env.MAX_SESSIONS_PER_DAY ?? 6);

/** Starts a new session, choosing the topic from what the student has done so far. */
export async function POST() {
  // Without a database there is nothing to start; the browser does this itself.
  if (isSoloMode()) return new NextResponse(null, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const admin = createAdminClient();

  // Resume rather than duplicate if one is already open.
  const { data: open } = await admin
    .from('sessions')
    .select('id')
    .eq('student_id', user.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (open) return NextResponse.json({ sessionId: open.id, resumed: true });

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const { count } = await admin
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', user.id)
    .gte('started_at', since.toISOString());

  if ((count ?? 0) >= MAX_SESSIONS_PER_DAY) {
    return NextResponse.json(
      { error: 'daily-limit', message: 'You have done a lot today. Come back tomorrow with fresh eyes.' },
      { status: 429 },
    );
  }

  const { data: progressRows } = await admin
    .from('progress')
    .select('*')
    .eq('student_id', user.id);

  const choice = pickTopic((progressRows ?? []) as ProgressRow[]);

  const { data: created, error } = await admin
    .from('sessions')
    .insert({ student_id: user.id, topic_id: choice.topic.id })
    .select('id')
    .single();

  if (error || !created) {
    console.error('[session/start] insert failed', error);
    return NextResponse.json({ error: 'Could not start a session' }, { status: 500 });
  }

  await admin.from('progress').upsert(
    {
      student_id: user.id,
      topic_id: choice.topic.id,
      status: 'shaky',
      attempts: 1,
      last_worked_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,topic_id', ignoreDuplicates: true },
  );

  return NextResponse.json({
    sessionId: created.id,
    topicId: choice.topic.id,
    reason: choice.reason,
    because: choice.because,
  });
}
