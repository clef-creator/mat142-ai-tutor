import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  findActiveStudentEnrollment,
  INACTIVE_ENROLLMENT_ERROR,
  INACTIVE_ENROLLMENT_MESSAGE,
} from '@/lib/enrollment';
import { getTopic } from '@/lib/curriculum';
import { isSoloMode } from '@/lib/mode';
import { summariseSession } from '@/lib/signals';
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
  const enrollment = await findActiveStudentEnrollment(admin, user);
  if (!enrollment) {
    return NextResponse.json(
      { error: INACTIVE_ENROLLMENT_ERROR, message: INACTIVE_ENROLLMENT_MESSAGE },
      { status: 403 },
    );
  }

  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('student_id', user.id)
    .maybeSingle();

  if (sessionError) return NextResponse.json({ error: 'Could not read session' }, { status: 500 });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.ended_at) return NextResponse.json({ ok: true, alreadyEnded: true });

  const { data: history, error: historyError } = await admin
    .from('messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('id', { ascending: true });
  if (historyError) return NextResponse.json({ error: 'Could not read history' }, { status: 500 });

  const topic = getTopic(session.topic_id);

  // A session too short to judge never reaches the model; one that does may
  // still come back unusable. Either way `assessed` is false and no judgement
  // about the student is recorded.
  const signals = await summariseSession({
    topicTitle: topic?.title ?? session.topic_id,
    topicName: topic?.student_facing_name ?? session.topic_id,
    history: (history ?? []) as ChatMessage[],
  });

  const { data: saved, error: saveError } = await admin.rpc('finalize_tutor_session', {
    p_session_id: sessionId,
    p_student_id: user.id,
    p_assessed: signals.assessed,
    p_outcome: signals.assessed ? signals.outcome : null,
    p_summary: signals.summary,
    p_sticking_point: signals.assessed ? signals.sticking_point : null,
    p_asked_for_answers: signals.assessed && signals.asked_for_answers,
    p_self_critical: signals.assessed && signals.self_critical,
  });
  if (saveError || !saved) {
    console.error('[session/end] save failed', saveError);
    return NextResponse.json({ error: 'Could not save session', message: 'Could not save the session. Please try again.' }, { status: 500 });
  }
  const result = saved as { status: string };
  if (result.status === 'not_found') return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (result.status === 'already_ended') return NextResponse.json({ ok: true, alreadyEnded: true });
  if (result.status === 'busy') {
    return NextResponse.json({ error: 'Reply in progress', message: 'Wait for the tutor reply before ending this session.' }, { status: 409 });
  }
  if (result.status !== 'completed') {
    return NextResponse.json({ error: 'Could not save session', message: 'Could not save the session. Please try again.' }, { status: 500 });
  }

  if (!signals.assessed) {
    // Leave the progress row exactly as it is — including `attempts`, so the
    // assessment can be retried later without the student appearing to have
    // had two goes at the topic.
    return NextResponse.json({
      ok: true,
      tooShort: signals.reason === 'too_short',
      assessed: false,
      reason: signals.reason,
    });
  }

  return NextResponse.json({ ok: true, assessed: true, outcome: signals.outcome });
}
