export const modelState = {
  chunks: ['Hello', ' student'],
  failDuringStream: false,
  failOnFinal: false,
};

export default class Anthropic {
  messages = {
    stream: () => ({
      async *[Symbol.asyncIterator]() {
        for (const text of modelState.chunks) {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
        }
        if (modelState.failDuringStream) throw new Error('model connection lost');
      },
      async finalMessage() {
        if (modelState.failOnFinal) throw new Error('model finalization failed');
        return { usage: { input_tokens: 10, output_tokens: 5 } };
      },
    }),
  };
}
