import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getTopic } from '@/lib/curriculum';
import { isSoloMode } from '@/lib/mode';
import { ACCESS_COOKIE, hasAccess } from '@/lib/access';
import { MIN_MESSAGES_TO_SUMMARISE, summariseSession } from '@/lib/signals';
import type { ChatMessage } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY = 120;

/**
 * Ends a solo session and hands the signals back to the browser to keep.
 *
 * Same reading of the conversation as the full version — the difference is only
 * where the result is put. Nothing is written here; the browser stores what
 * comes back and sends it up again next time so the tutor can pick up the
 * thread.
 */
export async function POST(req: Request) {
  if (!isSoloMode()) {
    return NextResponse.json({ error: 'Not available in this mode' }, { status: 404 });
  }

  const jar = await cookies();
  if (!(await hasAccess(jar.get(ACCESS_COOKIE)?.value))) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: { history?: ChatMessage[]; topicId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const topic = getTopic(body.topicId ?? '');
  if (!topic) return NextResponse.json({ error: 'Unknown topic' }, { status: 400 });

  const history: ChatMessage[] = (Array.isArray(body.history) ? body.history : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

  if (history.length < MIN_MESSAGES_TO_SUMMARISE) {
    return NextResponse.json({
      ok: true,
      tooShort: true,
      signals: {
        outcome: 'shaky',
        summary: 'Session ended almost immediately.',
        sticking_point: null,
        asked_for_answers: false,
        self_critical: false,
      },
    });
  }

  const signals = await summariseSession({
    topicTitle: topic.title,
    topicName: topic.student_facing_name,
    history,
  });

  return NextResponse.json({ ok: true, signals });
}
