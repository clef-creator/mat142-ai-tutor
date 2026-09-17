import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  findActiveStudentEnrollment,
  INACTIVE_ENROLLMENT_ERROR,
  INACTIVE_ENROLLMENT_MESSAGE,
} from '@/lib/enrollment';
import { buildSessionPrompt } from '@/lib/prompt';
import { choiceForTopic } from '@/lib/picker';
import { streamTutorReply, STREAM_HEADERS } from '@/lib/tutor';
import { isSoloMode } from '@/lib/mode';
import type { ChatMessage, ProgressRow } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_TURNS = Number(process.env.MAX_TURNS_PER_SESSION ?? 40);
const MAX_MESSAGE_CHARS = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The browser uses this after a stream ends or a connection is lost. */
export async function GET(req: Request) {
  if (isSoloMode()) return NextResponse.json({ error: 'Not available in this mode' }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');
  const requestId = url.searchParams.get('requestId');
  if (!sessionId || !requestId || !UUID.test(sessionId) || !UUID.test(requestId)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const admin = createAdminClient();
  const enrollment = await findActiveStudentEnrollment(admin, user);
  if (!enrollment) {
    return NextResponse.json(
      { error: INACTIVE_ENROLLMENT_ERROR, message: INACTIVE_ENROLLMENT_MESSAGE },
      { status: 403 },
    );
  }
  const { data: session, error: sessionError } = await admin.from('sessions').select('id')
    .eq('id', sessionId).eq('student_id', user.id).maybeSingle();
  if (sessionError) return NextResponse.json({ error: 'Could not check session' }, { status: 500 });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  const [turnResult, historyResult] = await Promise.all([
    admin.from('chat_turns').select('status, lease_until')
      .eq('session_id', sessionId).eq('request_id', requestId)
      .eq('student_id', user.id).maybeSingle(),
    admin.from('messages').select('role, content')
      .eq('session_id', sessionId).eq('student_id', user.id)
      .order('id', { ascending: true }),
  ]);
  if (turnResult.error || historyResult.error) {
    return NextResponse.json({ error: 'Could not check saved history' }, { status: 500 });
  }
  const turn = turnResult.data;
  return NextResponse.json({
    status: turn?.status ?? 'missing',
    retryAfter: turn?.status === 'processing' ? turn.lease_until : null,
    history: historyResult.data ?? [],
  });
}

/** One turn of tutoring, for a signed-in student. */
export async function POST(req: Request) {
  if (isSoloMode()) {
    return NextResponse.json({ error: 'Not available in this mode' }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body: { sessionId?: string; requestId?: string; message?: string; opening?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (body.opening !== undefined && typeof body.opening !== 'boolean') {
    return NextResponse.json({ error: 'Invalid opening flag' }, { status: 400 });
  }

  const { sessionId, requestId, opening } = body;
  if (body.message !== undefined && typeof body.message !== 'string') {
    return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
  }
  const message = (body.message ?? '').slice(0, MAX_MESSAGE_CHARS).trim();

  if (!sessionId || !requestId || !UUID.test(sessionId) || !UUID.test(requestId)) {
    return NextResponse.json({ error: 'Missing or invalid session/request ID' }, { status: 400 });
  }
  if (!opening && !message) return NextResponse.json({ error: 'Empty message' }, { status: 400 });
  if (opening && message) return NextResponse.json({ error: 'Opening cannot include a message' }, { status: 400 });

  const admin = createAdminClient();
  const enrollment = await findActiveStudentEnrollment(admin, user);
  if (!enrollment) {
    return NextResponse.json(
      { error: INACTIVE_ENROLLMENT_ERROR, message: INACTIVE_ENROLLMENT_MESSAGE },
      { status: 403 },
    );
  }

  const { data: claim, error: claimError } = await admin.rpc('claim_chat_turn', {
    p_session_id: sessionId, p_student_id: user.id, p_request_id: requestId,
    p_opening: Boolean(opening), p_message: message, p_max_turns: MAX_TURNS,
  });
  if (claimError || !claim) {
    console.error('[chat] claim failed', claimError);
    return NextResponse.json({ error: 'Could not start turn' }, { status: 500 });
  }
  const result = claim as { status: string; reply?: string; generationId?: string };
  if (result.status === 'completed') {
    return new Response(result.reply ?? '', { headers: STREAM_HEADERS });
  }
  if (result.status !== 'claimed') {
    const status = result.status === 'not_found' ? 404 : result.status === 'turn_limit' ? 429 : 409;
    return NextResponse.json({ error: result.status, message: result.status === 'busy'
      ? 'Another reply is still in progress. Try again shortly.'
      : result.status === 'turn_limit' ? 'This session has reached its length limit.'
      : 'This turn cannot be started.' }, { status });
  }
  const generationId = result.generationId!;
  const fail = async () => {
    const { error } = await admin.rpc('fail_chat_turn', {
      p_session_id: sessionId, p_student_id: user.id,
      p_request_id: requestId, p_generation_id: generationId,
    });
    if (error) throw error;
  };

  try {
    // The claim serializes this session before any history is read.
    const { data: session } = await admin
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('student_id', user.id)
      .maybeSingle();

    if (!session) { await fail(); return NextResponse.json({ error: 'Session not found' }, { status: 404 }); }

    // --- history --------------------------------------------------------------
    const { data: history, error: historyError } = await admin
      .from('messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('id', { ascending: true });

    if (historyError) { await fail(); return NextResponse.json({ error: 'Could not read history' }, { status: 500 }); }
    const priorMessages: ChatMessage[] = (history ?? []) as ChatMessage[];

    // --- context for the prompt ----------------------------------------------
    const { data: progressRows } = await admin
      .from('progress')
      .select('*')
      .eq('student_id', user.id);
    const progress = (progressRows ?? []) as ProgressRow[];

    const { data: student } = await admin
      .from('students')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();

    const { count: sessionCount } = await admin
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', user.id);

    const { data: lastSession } = await admin
      .from('sessions')
      .select('topic_id, summary')
      .eq('student_id', user.id)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // The session's topic was fixed when it was created; keep using that one.
    const sessionPrompt = buildSessionPrompt({
      studentName: student?.display_name ?? null,
      choice: choiceForTopic(session.topic_id, progress),
      progress,
      lastSummary: lastSession?.summary ?? null,
      lastTopicId: lastSession?.topic_id ?? null,
      sessionNumber: sessionCount ?? 1,
    });

    const outbound: ChatMessage[] = [...priorMessages];
    if (message) outbound.push({ role: 'user', content: message });

    const stream = streamTutorReply({
      sessionPrompt,
      messages: outbound,
      async onComplete(full, usage) {
        const { data: saved, error } = await admin.rpc('complete_chat_turn', {
          p_session_id: sessionId, p_student_id: user.id, p_request_id: requestId,
          p_generation_id: generationId, p_reply: full,
          p_input_tokens: usage.inputTokens, p_output_tokens: usage.outputTokens,
        });
        if (error || !saved) throw error ?? new Error('Turn completion was rejected');
      },
      onError: fail,
    });

    return new Response(stream, { headers: STREAM_HEADERS });
  } catch (error) {
    console.error('[chat] turn setup failed', error);
    try { await fail(); } catch (releaseError) {
      console.error('[chat] turn release failed', releaseError);
    }
    return NextResponse.json({ error: 'Could not start reply' }, { status: 500 });
  }
}
