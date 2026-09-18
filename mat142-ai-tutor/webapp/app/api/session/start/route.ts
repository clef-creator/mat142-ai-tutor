import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  findActiveStudentEnrollment,
  INACTIVE_ENROLLMENT_ERROR,
  INACTIVE_ENROLLMENT_MESSAGE,
} from '@/lib/enrollment';
import { pickTopic } from '@/lib/picker';
import { getTopic } from '@/lib/curriculum';
import { isSoloMode } from '@/lib/mode';
import type { ProgressRow } from '@/lib/types';

export const runtime = 'nodejs';

const MAX_SESSIONS_PER_DAY = Number(process.env.MAX_SESSIONS_PER_DAY ?? 6);

/** Starts or resumes a session. A requested topic is used only for a new session. */
export async function POST(req: Request) {
  // Without a database there is nothing to start; the browser does this itself.
  if (isSoloMode()) return new NextResponse(null, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const admin = createAdminClient();
  const enrollment = await findActiveStudentEnrollment(admin, user);
  if (!enrollment) {
    return NextResponse.json(
      { error: INACTIVE_ENROLLMENT_ERROR, message: INACTIVE_ENROLLMENT_MESSAGE },
      { status: 403 },
    );
  }

  let requestedTopicId: string | undefined;
  if (req.headers.get('content-type')?.includes('application/json')) {
    let body: unknown;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      ('topicId' in body && typeof body.topicId !== 'string')) {
      return NextResponse.json({ error: 'Invalid topic' }, { status: 400 });
    }
    requestedTopicId = 'topicId' in body ? body.topicId as string : undefined;
    if (requestedTopicId !== undefined && !getTopic(requestedTopicId)) {
      return NextResponse.json({ error: 'Unknown topic' }, { status: 400 });
    }
  }

  // Resume rather than duplicate if one is already open.
  const { data: open, error: openError } = await admin
    .from('sessions')
    .select('id, topic_id')
    .eq('student_id', user.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openError) return NextResponse.json({ error: 'Could not read sessions' }, { status: 500 });
  if (open) {
    if (requestedTopicId && open.topic_id !== requestedTopicId) {
      return NextResponse.json({
        error: 'Session still open',
        message: 'Finish the current session before switching topics.',
      }, { status: 409 });
    }
    const { error } = await admin.from('progress').upsert(
      { student_id: user.id, topic_id: open.topic_id, status: 'shaky', attempts: 0 },
      { onConflict: 'student_id,topic_id', ignoreDuplicates: true },
    );
    if (error) return NextResponse.json({ error: 'Could not resume session' }, { status: 500 });
    return NextResponse.json({ sessionId: open.id, topicId: open.topic_id, resumed: true });
  }

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const { count, error: countError } = await admin
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', user.id)
    .gte('started_at', since.toISOString());
  if (countError) return NextResponse.json({ error: 'Could not check session limit' }, { status: 500 });

  if ((count ?? 0) >= MAX_SESSIONS_PER_DAY) {
    return NextResponse.json(
      { error: 'daily-limit', message: 'You have done a lot today. Come back tomorrow with fresh eyes.' },
      { status: 429 },
    );
  }

  const { data: progressRows, error: progressError } = await admin
    .from('progress')
    .select('*')
    .eq('student_id', user.id);
  if (progressError) return NextResponse.json({ error: 'Could not read progress' }, { status: 500 });

  const choice = requestedTopicId
    ? { topic: getTopic(requestedTopicId)!, reason: 'next', because: 'You chose this topic to work on.' }
    : pickTopic((progressRows ?? []) as ProgressRow[]);

  const { data: created, error } = await admin
    .from('sessions')
    .insert({ student_id: user.id, topic_id: choice.topic.id })
    .select('id')
    .single();

  if (error || !created) {
    console.error('[session/start] insert failed', error);
    return NextResponse.json({ error: 'Could not start a session' }, { status: 500 });
  }

  // The row exists from the moment a topic is opened, so an abandoned session
  // is not lost. `attempts` stays at zero until a session is actually judged —
  // session/end is the only place it goes up, and only when `assessed` is true.
  // Counting the opening here as well made one finished session read as two.
  const { error: progressWriteError } = await admin.from('progress').upsert(
    {
      student_id: user.id,
      topic_id: choice.topic.id,
      status: 'shaky',
      attempts: 0,
      last_worked_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,topic_id', ignoreDuplicates: true },
  );
  if (progressWriteError) {
    console.error('[session/start] progress write failed', progressWriteError);
    const { error: cleanupError } = await admin.from('sessions').delete()
      .eq('id', created.id).eq('student_id', user.id);
    if (cleanupError) console.error('[session/start] cleanup failed', cleanupError);
    return NextResponse.json({ error: 'Could not start a session' }, { status: 500 });
  }

  return NextResponse.json({
    sessionId: created.id,
    topicId: choice.topic.id,
    reason: choice.reason,
    because: choice.because,
  });
}
