import type { ChatMessage } from './types';

/**
 * The one place that decides what the model is actually shown.
 *
 * In the try-it-out version there is no database, so the browser sends up the
 * conversation so far alongside whatever the student has just typed. That
 * leaves an obvious way to get it wrong: send the new message inside the
 * history *and* alongside it, and the model reads it twice — which costs money
 * on every turn and makes the tutor answer as though the student repeated
 * themselves.
 *
 * The contract is therefore fixed here and nowhere else:
 *
 *   `history` is everything said *before* this turn.
 *   `message` is the new thing being said.
 *
 * The browser is not trusted to honour that, so the join below also refuses to
 * append a message that is already sitting at the end of the history. A retry
 * of a turn that half-succeeded, or an older tab still running the previous
 * version of the page, then behaves correctly rather than duplicating.
 */

const MAX_MESSAGE_CHARS = 4000;

/** Keeps only well-formed turns, and bounds what any one of them can cost. */
export function cleanHistory(history: unknown, maxChars = MAX_MESSAGE_CHARS): ChatMessage[] {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      (m): m is ChatMessage =>
        Boolean(m) &&
        ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') &&
        typeof (m as ChatMessage).content === 'string',
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, maxChars) }));
}

/**
 * Joins the conversation so far to the new message, exactly once.
 *
 * `history` is expected to already be cleaned. An empty or missing `message`
 * (the opening turn, where the tutor speaks first) simply returns the history.
 */
export function joinTurn(history: ChatMessage[], message?: string | null): ChatMessage[] {
  const text = (message ?? '').trim();
  if (!text) return [...history];

  const last = history[history.length - 1];
  if (last && last.role === 'user' && last.content.trim() === text) {
    // Already there — the browser sent it both ways round. Take it once.
    return [...history];
  }

  return [...history, { role: 'user', content: text }];
}
