import { accountIntegrationState as state } from './account-integration-state';

export const STREAM_HEADERS = { 'Content-Type': 'text/plain; charset=utf-8' };

export function streamTutorReply(opts: {
  onComplete?: (full: string, usage: { inputTokens: number; outputTokens: number }) => Promise<void>;
  onError?: () => Promise<void>;
}) {
  state.tutorCalls++;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (state.holdModel) await state.holdModel;
        const reply = `Tutor reply ${state.tutorCalls}`;
        controller.enqueue(new TextEncoder().encode(reply));
        if (state.modelFails) throw new Error('injected model failure');
        await opts.onComplete?.(reply, { inputTokens: 10, outputTokens: 5 });
        controller.close();
      } catch (error) {
        await opts.onError?.();
        controller.error(error);
      }
    },
  });
}
