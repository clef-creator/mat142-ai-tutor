import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getTopic } from '@/lib/curriculum';
import { isSoloMode } from '@/lib/mode';
import { MIN_MESSAGES_TO_SUMMARISE, summariseSession } from '@/lib/signals';
import type { ChatMessage } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Ends a session and turns it into signals.
 *
 * The transcript stays where it is, readable only by the student it belongs to;
 * what the dashboard will eventually read is written here.
 */
export async function POST(req: Request) {
  if (isSoloMode()) {
    return NextResponse.json({ error: 'Not available in this mode' }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let sessionId: string | undefined;
  try {
    ({ sessionId } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (!sessionId) return NextResponse.json({ error: 'Missing session' }, { status: 400 });

  const admin = createAdminClient();

  const { data: session } = await admin
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('student_id', user.id)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.ended_at) return NextResponse.json({ ok: true, alreadyEnded: true });

  const { data: history } = await admin
    .from('messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('id', { ascending: true });

  const endedAt = new Date().toISOString();
  const topic = getTopic(session.topic_id);

  // Too short to judge. Close it without spending anything on a summary.
  if (!history || history.length < MIN_MESSAGES_TO_SUMMARISE) {
    await admin
      .from('sessions')
      .update({ ended_at: endedAt, outcome: 'shaky', summary: 'Session ended almost immediately.' })
      .eq('id', sessionId);
    return NextResponse.json({ ok: true, tooShort: true });
  }

  const signals = await summariseSession({
    topicTitle: topic?.title ?? session.topic_id,
    topicName: topic?.student_facing_name ?? session.topic_id,
    history: history as ChatMessage[],
  });

  await admin
    .from('sessions')
    .update({
      ended_at: endedAt,
      outcome: signals.outcome,
      summary: signals.summary,
      sticking_point: signals.sticking_point,
      asked_for_answers: signals.asked_for_answers,
      self_critical: signals.self_critical,
    })
    .eq('id', sessionId);

  const { data: existing } = await admin
    .from('progress')
    .select('attempts')
    .eq('student_id', user.id)
    .eq('topic_id', session.topic_id)
    .maybeSingle();

  await admin.from('progress').upsert(
    {
      student_id: user.id,
      topic_id: session.topic_id,
      status: signals.outcome,
      attempts: (existing?.attempts ?? 0) + 1,
      last_worked_at: endedAt,
      note: signals.sticking_point,
    },
    { onConflict: 'student_id,topic_id' },
  );

  await admin.from('students').update({ last_seen_at: endedAt }).eq('id', user.id);

  return NextResponse.json({ ok: true, outcome: signals.outcome });
}
