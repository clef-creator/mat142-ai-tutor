import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { buildSessionPrompt } from '@/lib/prompt';
import { choiceForTopic } from '@/lib/picker';
import { getTopic } from '@/lib/curriculum';
import { streamTutorReply, STREAM_HEADERS } from '@/lib/tutor';
import { isSoloMode } from '@/lib/mode';
import { ACCESS_COOKIE, hasAccess } from '@/lib/access';
import type { ChatMessage, ProgressRow } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_TURNS = Number(process.env.MAX_TURNS_PER_SESSION ?? 40);
const MAX_MESSAGE_CHARS = 4000;
const MAX_NAME_CHARS = 40;

/**
 * One turn of tutoring with no database behind it.
 *
 * The conversation lives in the browser and is sent up with each turn, which is
 * the whole reason this mode needs no Supabase. It also means the server trusts
 * the browser about what was said, so the limits below are enforced here rather
 * than assumed: they bound what a single request can cost regardless of what
 * arrives.
 */
export async function POST(req: Request) {
  if (!isSoloMode()) {
    return NextResponse.json({ error: 'Not available in this mode' }, { status: 404 });
  }

  const jar = await cookies();
  if (!(await hasAccess(jar.get(ACCESS_COOKIE)?.value))) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: {
    history?: ChatMessage[];
    message?: string;
    opening?: boolean;
    topicId?: string;
    progress?: ProgressRow[];
    studentName?: string | null;
    sessionNumber?: number;
    lastSummary?: string | null;
    lastTopicId?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const message = (body.message ?? '').slice(0, MAX_MESSAGE_CHARS).trim();
  if (!body.opening && !message) {
    return NextResponse.json({ error: 'Empty message' }, { status: 400 });
  }

  const topic = getTopic(body.topicId ?? '');
  if (!topic) return NextResponse.json({ error: 'Unknown topic' }, { status: 400 });

  // --- keep what one request can cost bounded --------------------------------
  const history = Array.isArray(body.history) ? body.history : [];

  if (history.length > MAX_TURNS * 2) {
    return NextResponse.json(
      {
        error: 'turn-limit',
        message: 'This session has run a long way. End it and start a fresh one — the tutor will remember where you got to.',
      },
      { status: 429 },
    );
  }

  const cleanHistory: ChatMessage[] = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

  const progress = Array.isArray(body.progress) ? body.progress : [];

  const sessionPrompt = buildSessionPrompt({
    studentName: body.studentName ? String(body.studentName).slice(0, MAX_NAME_CHARS) : null,
    choice: choiceForTopic(topic.id, progress),
    progress,
    lastSummary: body.lastSummary ? String(body.lastSummary).slice(0, 2000) : null,
    lastTopicId: body.lastTopicId ?? null,
    sessionNumber: Math.max(1, Math.min(999, Number(body.sessionNumber) || 1)),
  });

  const outbound = [...cleanHistory];
  if (message) outbound.push({ role: 'user', content: message });

  return new Response(
    streamTutorReply({ sessionPrompt, messages: outbound }),
    { headers: STREAM_HEADERS },
  );
}
