import Anthropic from '@anthropic-ai/sdk';
import { buildStaticPrompt } from './prompt';
import type { ChatMessage } from './types';

/**
 * One turn of tutoring, streamed.
 *
 * Both modes come through here, deliberately. The way the tutor teaches — the
 * hint ladder, refusing to confirm a wrong answer, dropping back to algebra —
 * must not differ between the version being tried out and the version students
 * eventually use, or trying it out proves nothing.
 *
 * The Anthropic key is read here, on the server, and never leaves it. The
 * browser only ever receives the words the tutor says.
 */
export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
}

export function streamTutorReply(opts: {
  sessionPrompt: string;
  messages: ChatMessage[];
  /** Runs once the reply is complete. Failures here must not break the stream. */
  onComplete?: (full: string, usage: TurnUsage) => Promise<void>;
}): ReadableStream<Uint8Array> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const encoder = new TextEncoder();

  // A conversation must start with a user turn, so the opening move is framed
  // as an instruction rather than left empty.
  const messages =
    opts.messages.length > 0
      ? opts.messages
      : [{ role: 'user' as const, content: 'Begin the session.' }];

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = '';

      try {
        const result = anthropic.messages.stream({
          model: process.env.TUTOR_MODEL ?? 'claude-opus-5',
          max_tokens: 1024,
          system: [
            // Marked for caching: identical on every turn, so the API charges a
            // tenth of the input rate to re-read it. Without this the project
            // costs roughly four times as much.
            { type: 'text', text: buildStaticPrompt(), cache_control: { type: 'ephemeral' } },
            { type: 'text', text: opts.sessionPrompt },
          ],
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });

        for await (const event of result) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            full += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const final = await result.finalMessage();
        const u = final.usage;

        if (opts.onComplete) {
          try {
            await opts.onComplete(full, {
              inputTokens:
                (u.input_tokens ?? 0) +
                (u.cache_creation_input_tokens ?? 0) +
                (u.cache_read_input_tokens ?? 0),
              outputTokens: u.output_tokens ?? 0,
            });
          } catch (err) {
            // Bookkeeping failing must not cost the student their reply.
            console.error('[tutor] post-reply bookkeeping failed', err);
          }
        }
      } catch (err) {
        console.error('[tutor] model call failed', err);
        controller.enqueue(
          encoder.encode(
            full.length > 0
              ? '\n\n(Something interrupted that reply. Send your message again.)'
              : 'Sorry \u2014 I could not reach the tutor just then. Try sending that again in a moment.',
          ),
        );
      } finally {
        controller.close();
      }
    },
  });
}

export const STREAM_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Accel-Buffering': 'no',
};
