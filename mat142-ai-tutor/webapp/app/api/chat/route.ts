import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { buildSessionPrompt } from '@/lib/prompt';
import { choiceForTopic } from '@/lib/picker';
import { streamTutorReply, STREAM_HEADERS } from '@/lib/tutor';
import { isSoloMode } from '@/lib/mode';
import type { ChatMessage, ProgressRow } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_TURNS = Number(process.env.MAX_TURNS_PER_SESSION ?? 40);
const MAX_MESSAGE_CHARS = 4000;

/** One turn of tutoring, for a signed-in student. */
export async function POST(req: Request) {
  if (isSoloMode()) {
    return NextResponse.json({ error: 'Not available in this mode' }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body: { sessionId?: string; message?: string; opening?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const { sessionId, opening } = body;
  const message = (body.message ?? '').slice(0, MAX_MESSAGE_CHARS).trim();

  if (!sessionId) return NextResponse.json({ error: 'Missing session' }, { status: 400 });
  if (!opening && !message) return NextResponse.json({ error: 'Empty message' }, { status: 400 });

  const admin = createAdminClient();

  // --- the session must belong to this student, and still be open -----------
  const { data: session } = await admin
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('student_id', user.id)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.ended_at) return NextResponse.json({ error: 'Session already ended' }, { status: 409 });

  if (session.turn_count >= MAX_TURNS) {
    return NextResponse.json(
      { error: 'turn-limit', message: 'This session has reached its length limit. Start a new one when you are ready.' },
      { status: 429 },
    );
  }

  // --- history --------------------------------------------------------------
  const { data: history } = await admin
    .from('messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('id', { ascending: true });

  const priorMessages: ChatMessage[] = (history ?? []) as ChatMessage[];

  if (opening && priorMessages.length > 0) {
    return NextResponse.json({ error: 'Session already opened' }, { status: 409 });
  }

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

  // --- persist the student's turn before calling the model -------------------
  if (message) {
    await admin.from('messages').insert({
      session_id: sessionId,
      student_id: user.id,
      role: 'user',
      content: message,
    });
  }

  const outbound: ChatMessage[] = [...priorMessages];
  if (message) outbound.push({ role: 'user', content: message });

  const stream = streamTutorReply({
    sessionPrompt,
    messages: outbound,
    async onComplete(full, usage) {
      await admin.from('messages').insert({
        session_id: sessionId,
        student_id: user.id,
        role: 'assistant',
        content: full,
      });

      await admin
        .from('sessions')
        .update({ turn_count: session.turn_count + 1 })
        .eq('id', sessionId);

      const today = new Date().toISOString().slice(0, 10);
      const { data: existing } = await admin
        .from('usage_daily')
        .select('input_tokens, output_tokens, turns')
        .eq('student_id', user.id)
        .eq('day', today)
        .maybeSingle();

      await admin.from('usage_daily').upsert(
        {
          student_id: user.id,
          day: today,
          input_tokens: (existing?.input_tokens ?? 0) + usage.inputTokens,
          output_tokens: (existing?.output_tokens ?? 0) + usage.outputTokens,
          turns: (existing?.turns ?? 0) + 1,
        },
        { onConflict: 'student_id,day' },
      );
    },
  });

  return new Response(stream, { headers: STREAM_HEADERS });
}
