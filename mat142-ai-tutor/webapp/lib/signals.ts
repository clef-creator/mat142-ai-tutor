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
 */
export interface Signals {
  outcome: TopicStatus;
  summary: string;
  sticking_point: string | null;
  asked_for_answers: boolean;
  self_critical: boolean;
}

/** Too short to judge — worth closing without spending anything on a summary. */
export const MIN_MESSAGES_TO_SUMMARISE = 4;

export function fallbackSignals(topicName: string): Signals {
  return {
    outcome: 'shaky',
    summary: `Worked on ${topicName}.`,
    sticking_point: null,
    asked_for_answers: false,
    self_critical: false,
  };
}

export async function summariseSession(args: {
  topicTitle: string;
  topicName: string;
  history: ChatMessage[];
}): Promise<Signals> {
  const fallback = fallbackSignals(args.topicName);

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

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;

    const parsed = JSON.parse(match[0]) as Partial<Signals>;
    return {
      outcome: parsed.outcome === 'steady' ? 'steady' : 'shaky',
      summary: parsed.summary ?? fallback.summary,
      sticking_point: parsed.sticking_point ?? null,
      asked_for_answers: Boolean(parsed.asked_for_answers),
      self_critical: Boolean(parsed.self_critical),
    };
  } catch (err) {
    // A failed summary must not lose the session.
    console.error('[signals] summarising failed', err);
    return fallback;
  }
}
