import assert from 'node:assert/strict';
import { streamTutorReply } from '@/lib/tutor';
import { readTutorStream } from '@/lib/chat-stream';
import { modelState } from './stubs/anthropic-stream';

async function run() {
  let saved = 0;
  let failed = 0;
  modelState.chunks = ['A partial ', 'reply'];
  modelState.failDuringStream = false;
  modelState.failOnFinal = false;

  const successful = await readTutorStream(streamTutorReply({
    sessionPrompt: 'Test topic', messages: [],
    async onComplete(text) { assert.equal(text, 'A partial reply'); saved++; },
    async onError() { failed++; },
  }), () => undefined);
  assert.equal(successful, 'A partial reply');
  assert.equal(saved, 1);
  assert.equal(failed, 0);

  modelState.failDuringStream = true;
  const partials: string[] = [];
  await assert.rejects(readTutorStream(streamTutorReply({
    sessionPrompt: 'Test topic', messages: [],
    async onComplete() { saved++; },
    async onError() { failed++; },
  }), (partial) => partials.push(partial)), /model connection lost/);
  assert.deepEqual(partials, ['A partial ', 'A partial reply']);
  assert.equal(saved, 1, 'partial model output was not saved');
  assert.equal(failed, 1, 'failed claim was released');

  modelState.failDuringStream = false;
  await assert.rejects(readTutorStream(streamTutorReply({
    sessionPrompt: 'Test topic', messages: [],
    async onComplete() { throw new Error('database write failed'); },
    async onError() { failed++; },
  }), () => undefined), /database write failed/);
  assert.equal(failed, 2, 'database failure released the claim');

  modelState.chunks = [];
  await assert.rejects(readTutorStream(streamTutorReply({
    sessionPrompt: 'Test topic', messages: [],
    async onComplete() { saved++; },
    async onError() { failed++; },
  }), () => undefined), /empty reply/);
  assert.equal(saved, 1, 'an empty reply was not saved');

  const network = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('Only half'));
      controller.error(new Error('network interrupted'));
    },
  });
  await assert.rejects(readTutorStream(network, () => undefined), /network interrupted/);
  await assert.rejects(readTutorStream(null, () => undefined), /No response body/);
  console.log('Chat failure checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
