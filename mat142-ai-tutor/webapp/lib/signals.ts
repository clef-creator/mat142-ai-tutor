import Anthropic from '@anthropic-ai/sdk';
import { SUMMARY_INSTRUCTIONS } from './prompt';
import type { ChatMessage, TopicStatus } from './types';

/**
 * Reading a finished session and writing down what happened.
 *
 * This is the step that makes "signals, not transcripts" work: a cheap model
 * reads the conversation once, records a few fields, and from then on those
 * fields are what gets looked at. It is also what lets the tutor pick up where
 * it left off next time, in either mode.
 *
 * The one thing this file must never do is guess. "Shaky" is a judgement about
 * a student, and a shaky topic is offered again ahead of everything else, so a
 * shaky mark that nobody actually made keeps a student on a topic they may
 * already have finished — and makes them look stuck to the teaching team. If
 * the summary cannot be made, or comes back malformed, or the session was over
 * before it began, that is recorded as *no assessment* rather than as a bad
 * one, and whatever was already known about the student is left alone.
 */

/** Why a session carries no judgement, when it carries none. */
export type UnassessedReason =
  | 'too_short'      // ended before there was anything to read
  | 'malformed'      // the model answered, but not with what was asked for
  | 'provider_error' // the call failed
  | 'unreachable';   // the browser never got an answer back

export interface Signals {
  outcome: TopicStatus;
  summary: string;
  sticking_point: string | null;
  asked_for_answers: boolean;
  self_critical: boolean;
  /**
   * True only when `outcome` is a judgement the summariser actually made.
   * When false, `outcome` is a placeholder and must not be written over what
   * is already recorded for the topic.
   */
  assessed: boolean;
  /** Set when `assessed` is false. */
  reason?: UnassessedReason;
}

/** Too short to judge — worth closing without spending anything on a summary. */
export const MIN_MESSAGES_TO_SUMMARISE = 4;

const MAX_SUMMARY_CHARS = 1000;
const MAX_STICKING_POINT_CHARS = 200;

/** What a session looks like when no judgement could be made about it. */
export function unassessedSignals(topicName: string, reason: UnassessedReason): Signals {
  return {
    outcome: 'shaky',
    summary:
      reason === 'too_short'
        ? 'Session ended almost immediately.'
        : `Worked on ${topicName}.`,
    sticking_point: null,
    asked_for_answers: false,
    self_critical: false,
    assessed: false,
    reason,
  };
}

/**
 * Turns whatever the model returned into signals, or decides it cannot.
 *
 * Every field is checked rather than coerced. A missing or unrecognised
 * `outcome` used to become "shaky" silently, which is exactly the guess this
 * file must not make.
 */
export function parseSignals(text: string, topicName: string): Signals {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return unassessedSignals(topicName, 'malformed');

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return unassessedSignals(topicName, 'malformed');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return unassessedSignals(topicName, 'malformed');
  }

  const raw = parsed as Record<string, unknown>;

  // The judgement itself. Anything other than the two permitted words means
  // the summariser did not answer the question, so nothing is recorded.
  if (raw.outcome !== 'steady' && raw.outcome !== 'shaky') {
    return unassessedSignals(topicName, 'malformed');
  }

  // The summary is read back to the tutor at the start of the next session, so
  // an empty one is no more use than a missing one.
  if (typeof raw.summary !== 'string' || raw.summary.trim() === '') {
    return unassessedSignals(topicName, 'malformed');
  }

  const sticking =
    typeof raw.sticking_point === 'string' && raw.sticking_point.trim() !== ''
      ? raw.sticking_point.trim().slice(0, MAX_STICKING_POINT_CHARS)
      : null;

  return {
    outcome: raw.outcome,
    summary: raw.summary.trim().slice(0, MAX_SUMMARY_CHARS),
    sticking_point: sticking,
    // These two only ever raise a flag, so treating anything that is not
    // literally true as false is the cautious way round.
    asked_for_answers: raw.asked_for_answers === true,
    self_critical: raw.self_critical === true,
    assessed: true,
  };
}

export async function summariseSession(args: {
  topicTitle: string;
  topicName: string;
  history: ChatMessage[];
}): Promise<Signals> {
  if (args.history.length < MIN_MESSAGES_TO_SUMMARISE) {
    return unassessedSignals(args.topicName, 'too_short');
  }

  const transcript = args.history
    .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
    .join('\n\n');

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const res = await anthropic.messages.create({
      model: process.env.SUMMARY_MODEL ?? 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SUMMARY_INSTRUCTIONS,
      messages: [{ role: 'user', content: `Topic: ${args.topicTitle}\n\n${transcript}` }],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return parseSignals(text, args.topicName);
  } catch (err) {
    // A failed summary must not lose the session — and must not invent a
    // judgement about the student either.
    console.error('[signals] summarising failed', err);
    return unassessedSignals(args.topicName, 'provider_error');
  }
}
